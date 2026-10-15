/**
 * session-usage Work Status 区块
 * 4 个数字：本会话 token（含子代理）、缓存命中率、费用（USD）、请求数。
 * 标题栏刷新按钮走 host.setStatusControls，旧宿主回退为区内小按钮。
 */
import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountButton, type BannerHandle, type ButtonHandle } from '@openchamber/sdk/ui';

// ---------------------------------------------------------------------------
// 类型（与 service/main.ts 的响应一致）
// ---------------------------------------------------------------------------

type Tokens = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number };
/** 与 panel/service 一致：cost=OpenCode USD；costCny*=DeepSeek 官方峰谷价人民币；costUsdOther=非 DeepSeek 的 USD。 */
type Money = {
  cost: number;
  costCny: number;
  costCnyPeak: number;
  costCnyOff: number;
  costUsdOther: number;
  hasDeepseek: boolean;
  hasOther: boolean;
};
type Agg = Money & { requests: number; tokens: Tokens; hitRate: number | null };
type Report = {
  ok: true;
  generatedAt: number;
  db: { path: string; schema: string };
  session: { id: string; title: string; childCount: number; descendantCount: number };
  main: Agg;
  total: Agg;
};

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

type Lang = 'zh' | 'en';

const L = {
  zh: {
    kTokens: '本会话 token',
    kHit: '缓存命中率',
    kCost: '费用',
    kRequests: '请求数',
    hitTip: 'cacheRead ÷ (input + cacheRead + cacheWrite)，分母含缓存写',
    costTip: (peak: string, off: string, hasDeepseek: boolean) =>
      hasDeepseek
        ? `DeepSeek 按官方峰谷价重算人民币（其中峰 ${peak} / 谷 ${off}；缓存写不计费）；其他模型为 OpenCode 记账 USD`
        : 'OpenCode 记录的美元费用（USD）',
    withSub: '含子代理',
    mainOnly: '仅主会话',
    updated: (t: string) => `${t} 更新`,
    noSession: '打开会话后显示用量',
    loading: '读取中…',
    refresh: '刷新',
    serviceDown: '用量服务不可用',
    dbMissing: '找不到 opencode.db',
    noData: '本会话暂无用量',
  },
  en: {
    kTokens: 'Session tokens',
    kHit: 'Cache hit rate',
    kCost: 'Cost',
    kRequests: 'Requests',
    hitTip: 'cacheRead ÷ (input + cacheRead + cacheWrite); denominator includes cache writes',
    costTip: (peak: string, off: string, hasDeepseek: boolean) =>
      hasDeepseek
        ? `DeepSeek recomputed at official peak/off-peak prices (CNY; peak ${peak} / off-peak ${off}; cache writes not billed); other models use OpenCode-recorded USD`
        : 'USD as recorded by OpenCode',
    withSub: 'with subagents',
    mainOnly: 'main only',
    updated: (t: string) => `updated ${t}`,
    noSession: 'Open a session to see usage',
    loading: 'Loading…',
    refresh: 'Refresh',
    serviceDown: 'Usage service unavailable',
    dbMissing: 'opencode.db not found',
    noData: 'No usage in this session yet',
  },
} as const;

type Strings = (typeof L)['zh'];
const detectLang = (locale: string | undefined): Lang => ((locale ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en');

// ---------------------------------------------------------------------------
// 环境与状态
// ---------------------------------------------------------------------------

const host = connectHost();
const params = new URLSearchParams(location.search);
const MOCK = params.has('mock');
const root = document.querySelector('#root') as HTMLElement;

let lang: Lang = detectLang(navigator.language);
const T = (): Strings => L[lang] as Strings;

let built = false;
let booted = false;
let loading = false;
let sessionId: string | null = null;
let lastAt = 0;
let statusControlsSupported = false;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');
const fmtTokens = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};
const fmtUsd = (n: number): string => `$${(n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4))}`;
const fmtCny = (n: number): string => `¥${n.toFixed(4)}`;

/** 费用文案：纯 DeepSeek → ¥x；混合 → ¥x + $y；无 DeepSeek → $y（与面板同一规则）。 */
const moneyText = (m: Money): string => {
  if (m.hasDeepseek) return m.hasOther ? `${fmtCny(m.costCny)} + ${fmtUsd(m.costUsdOther)}` : fmtCny(m.costCny);
  return fmtUsd(m.cost);
};
const costTipText = (m: Money): string => T().costTip(fmtCny(m.costCnyPeak), fmtCny(m.costCnyOff), m.hasDeepseek);
const fmtPct = (r: number | null): string => (r == null ? '—' : `${(r * 100).toFixed(1)}%`);
const fmtTime = (ts: number): string =>
  ts ? new Date(ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—';

// ---------------------------------------------------------------------------
// 骨架
// ---------------------------------------------------------------------------

type Cell = { cell: HTMLElement; value: HTMLElement };
let cTokens!: Cell;
let cHit!: Cell;
let cCost!: Cell;
let cReq!: Cell;
let footTitle!: HTMLElement;
let footMeta!: HTMLElement;
let bannerSlot!: HTMLElement;
let fallbackSlot!: HTMLElement;
let bannerHandle: BannerHandle | null = null;
let fallbackButton: ButtonHandle | null = null;

function makeCell(grid: HTMLElement, label: string, tip?: string, accent = false): Cell {
  const cell = el('div', accent ? 'cell accent' : 'cell');
  const k = el('div', 'k', label);
  if (tip) cell.title = tip;
  const value = el('div', 'v', '—');
  cell.append(k, value);
  grid.append(cell);
  return { cell, value };
}

function buildDom(): void {
  if (built) return;
  built = true;
  const t = T();
  const wrap = el('div', 'wrap');
  const grid = el('div', 'grid');
  cTokens = makeCell(grid, t.kTokens);
  cHit = makeCell(grid, t.kHit, t.hitTip, true);
  cCost = makeCell(grid, t.kCost);
  cReq = makeCell(grid, t.kRequests);
  const foot = el('div', 'foot');
  footTitle = el('span', 's-title', '');
  footMeta = el('span', 's-meta', '');
  foot.append(footTitle, footMeta);
  bannerSlot = el('div', 'banner-slot');
  fallbackSlot = el('div', 'fallback-slot');
  wrap.append(grid, foot, bannerSlot, fallbackSlot);
  root.append(wrap);
}

function syncHeight(): void {
  if (!built || MOCK) return;
  const h = Math.ceil((root.querySelector('.wrap') as HTMLElement).getBoundingClientRect().height) + 14;
  void host.setHeight(h);
}

function setBanner(tone: 'info' | 'warning' | 'error', title: string, body: string): void {
  if (!built) return;
  bannerHandle?.dispose();
  bannerHandle = mountBanner(bannerSlot, { tone, title, body });
  syncHeight();
}

function clearBanner(): void {
  bannerHandle?.dispose();
  bannerHandle = null;
}

function render(report: Report | null, state: 'no-session' | 'loading' | 'empty' | 'ready' | 'error', errorText = ''): void {
  if (!built) return;
  const t = T();
  if (state === 'ready' && report) {
    const a = report.total;
    cTokens.value.textContent = fmtTokens(a.tokens.total);
    cTokens.value.title = fmtInt(a.tokens.total);
    cHit.value.textContent = fmtPct(a.hitRate);
    cCost.value.textContent = moneyText(a);
    cCost.cell.title = costTipText(a);
    cReq.value.textContent = fmtInt(a.requests);
    footTitle.textContent = report.session.title || report.session.id;
    const scopeText = report.session.descendantCount > 0 ? t.withSub : '';
    footMeta.textContent = [scopeText, t.updated(fmtTime(lastAt || report.generatedAt))].filter(Boolean).join(' · ');
    clearBanner();
  } else {
    cTokens.value.textContent = '—';
    cHit.value.textContent = '—';
    cCost.value.textContent = '—';
    cCost.cell.title = '';
    cReq.value.textContent = '—';
    if (state === 'no-session') {
      footTitle.textContent = t.noSession;
      footMeta.textContent = '';
    } else if (state === 'loading') {
      footTitle.textContent = t.loading;
      footMeta.textContent = '';
    } else if (state === 'empty') {
      footTitle.textContent = t.noData;
      footMeta.textContent = '';
    } else if (state === 'error') {
      footTitle.textContent = errorText;
      footMeta.textContent = '';
    }
  }
  syncHeight();
}

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

async function fetchReport(sid: string): Promise<{ report?: Report; code?: string; message?: string; empty?: boolean; failed?: boolean }> {
  if (MOCK) return { report: mockReport(sid) };
  let res: { status: number; body: string };
  try {
    res = await host.serviceRequest({ method: 'GET', path: '/session', query: { sessionId: sid } });
  } catch {
    return { failed: true };
  }
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  if (res.status === 200 && payload && payload.ok) return { report: payload as unknown as Report };
  const code = typeof payload?.error === 'string' ? (payload.error as string) : `http-${res.status}`;
  const message = typeof payload?.message === 'string' ? (payload.message as string) : code;
  if (res.status === 404) return { empty: true };
  return { code, message, failed: true };
}

async function refresh(): Promise<void> {
  if (!built || loading) return;
  loading = true;
  const t = T();
  if (sessionId == null) {
    render(null, 'no-session');
    loading = false;
    return;
  }
  if (lastAt === 0) render(null, 'loading');
  const result = await fetchReport(sessionId);
  if (result.report) {
    lastAt = Date.now();
    render(result.report, 'ready');
  } else if (result.empty) {
    render(null, 'empty');
  } else {
    const isDb = result.code === 'db-missing';
    render(null, 'error', isDb ? t.dbMissing : t.serviceDown);
    setBanner('error', isDb ? t.dbMissing : t.serviceDown, result.message ?? '');
  }
  loading = false;
}

// ---------------------------------------------------------------------------
// 宿主接线
// ---------------------------------------------------------------------------

function publishStatusControls(): void {
  if (!built || MOCK || !statusControlsSupported) return;
  host
    .setStatusControls([{ kind: 'button', id: 'refresh', label: T().refresh }])
    .catch(() => {
      statusControlsSupported = false;
      showFallbackRefresh();
    });
}

function showFallbackRefresh(): void {
  if (!built || fallbackButton) return;
  fallbackButton = mountButton(fallbackSlot, { label: T().refresh, size: 'xs', variant: 'outline', onClick: () => void refresh() });
}

function boot(): void {
  if (booted) return;
  booted = true;
  void refresh();
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastAt > 15_000) void refresh();
  });
}

host.onStatusControl((event) => {
  if (event.id === 'refresh') void refresh();
});

host.onDirectory(() => {
  if (built && statusControlsSupported) publishStatusControls();
});

function applyHostSession(sid: string | null): void {
  if (sid === sessionId) return;
  sessionId = sid;
  lastAt = 0;
  if (!built) return;
  void refresh();
}

if (MOCK) {
  lang = detectLang(params.get('lang') ?? undefined);
  const dark = params.get('theme') !== 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.style.background = dark ? '#15171c' : '#ffffff';
  document.body.style.color = dark ? '#e8e8ea' : '#1b1b1f';
  document.body.style.minHeight = '100vh';
  sessionId = 'ses_mock000000000000000000000000';
  buildDom();
  render(mockReport(sessionId), 'ready');
} else {
  host.onReady((ctx) => {
    applyHostReady(ctx, document.documentElement);
    lang = detectLang(ctx.locale);
    buildDom();
    statusControlsSupported = ctx.features?.statusControls === true;
    if (statusControlsSupported) publishStatusControls();
    else showFallbackRefresh();
    applyHostSession(ctx.session?.id ?? null);
    boot();
  });

  host.onSession((snapshot) => {
    if (!built) return;
    applyHostSession(snapshot?.id ?? null);
  });

  setTimeout(() => {
    if (!built) {
      buildDom();
      render(null, 'no-session');
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// mock（?mock=1 预览用）
// ---------------------------------------------------------------------------

function mockReport(sid: string): Report {
  const now = Date.now();
  const t: Tokens = { input: 562091, output: 33215, reasoning: 206064, cacheRead: 6119936, cacheWrite: 0, total: 6921306 };

  // ?case=pure（纯 DeepSeek）/ other（无 DeepSeek）/ mixed（默认）
  const c = params.get('case');
  const ds = c !== 'other';
  const ot = c !== 'pure';
  const money = (cny: number, peak: number, off: number, usdOther: number, usdAll: number): Money => ({
    cost: usdAll,
    costCny: ds ? cny : 0,
    costCnyPeak: ds ? peak : 0,
    costCnyOff: ds ? off : 0,
    costUsdOther: ot ? usdOther : 0,
    hasDeepseek: ds,
    hasOther: ot,
  });
  const agg = (requests: number, tokens: Tokens, m: Money): Agg => ({
    ...m,
    requests,
    tokens,
    hitRate: tokens.cacheRead / (tokens.input + tokens.cacheRead + tokens.cacheWrite),
  });
  return {
    ok: true,
    generatedAt: now,
    db: { path: '~/.local/share/opencode/opencode.db', schema: 'v2' },
    session: { id: sid, title: '网页版 LLM 与 API Agent 搜索差异原因', childCount: 2, descendantCount: 2 },
    main: agg(77, { ...t, total: 6589807 }, money(0.4193, 0.1564, 0.2629, 0.02649, (ds ? 0.2 : 0) + (ot ? 0.02649 : 0))),
    total: agg(96, t, money(0.4528, 0.1689, 0.2839, 0.02624, (ds ? 0.22 : 0) + (ot ? 0.02624 : 0))),
  };
}
