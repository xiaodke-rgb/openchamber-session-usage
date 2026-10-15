/**
 * session-usage 面板
 * 展示「当前打开的会话」的会话级用量：KPI、按模型拆分、子代理合并/明细、prompt 大小曲线。
 */
import { connectHost } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBanner,
  mountButton,
  mountEmpty,
  mountTabs,
  type BannerHandle,
  type ButtonHandle,
  type EmptyHandle,
  type TabsHandle,
} from '@openchamber/sdk/ui';

// ---------------------------------------------------------------------------
// 类型（与 service/main.ts 的响应一致）
// ---------------------------------------------------------------------------

type Tokens = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number };
/** 费用口径：cost 是 OpenCode 记账 USD（全部消息）；costCny* 是 DeepSeek 官方峰谷价人民币；costUsdOther 是非 DeepSeek 的 USD。 */
type Money = {
  cost: number;
  costCny: number;
  costCnyPeak: number;
  costCnyOff: number;
  costUsdOther: number;
  hasDeepseek: boolean;
  hasOther: boolean;
};
type OfficialCny = { cny: number; peakCny: number; offCny: number };
type ModelAgg = {
  model: string;
  provider: string;
  requests: number;
  tokens: Tokens;
  cost: number;
  currency: 'CNY' | 'USD';
  amount: number;
  official: OfficialCny | null;
};
type Agg = Money & {
  requests: number;
  tokens: Tokens;
  hitRate: number | null;
  byModel: ModelAgg[];
  trend: { points: Array<[number, number]>; downsampled: boolean };
};
type ChildAgg = Money & {
  id: string;
  title: string;
  startedAt: number;
  lastMessageAt: number;
  requests: number;
  tokens: Tokens;
  hitRate: number | null;
  descendants: number;
};
type Report = {
  ok: true;
  generatedAt: number;
  db: { path: string; schema: string };
  pricing?: { peakWindowUtc: string; peakWindowLocal: string; note: string };
  session: {
    id: string;
    title: string;
    parentId: string | null;
    startedAt: number;
    lastMessageAt: number;
    childCount: number;
    descendantCount: number;
  };
  main: Agg;
  total: Agg;
  children: ChildAgg[];
};

type Scope = 'total' | 'main';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

type Lang = 'zh' | 'en';

const L = {
  zh: {
    title: '会话用量',
    refresh: '刷新',
    scopeAll: '含子代理',
    scopeMain: '仅主会话',
    kpiTotal: '总 token',
    kpiInput: '输入（未命中）',
    kpiOutput: '输出（含推理）',
    kpiReasoning: '推理',
    kpiCacheRead: '缓存读取',
    kpiCacheWrite: '缓存写入',
    kpiHit: '缓存命中率',
    kpiRequests: '请求数',
    kpiCost: '费用',
    hitTip: 'cacheRead ÷ (input + cacheRead + cacheWrite)，分母含缓存写',
    costTip: (peak: string, off: string, hasDeepseek: boolean) =>
      hasDeepseek
        ? `DeepSeek 按官方峰谷价重算人民币（其中峰 ${peak} / 谷 ${off}；缓存写不计费）；其他模型为 OpenCode 记账 USD`
        : 'OpenCode 记录的美元费用（USD）',
    costPeakOff: (peak: string, off: string) => `其中峰 ${peak} · 谷 ${off}`,
    outputTip: (o: string, r: string) => `输出 ${o}，其中推理 ${r}`,
    totalTip: (t: string) => `input + output + reasoning + cacheRead + cacheWrite = ${t}`,
    byModel: '按模型',
    children: (n: number) => `子会话明细（${n}）`,
    childSub: (req: number, hit: string) => `${req} 次请求 · 命中率 ${hit}`,
    childNested: (n: number) => `含 ${n} 层子会话`,
    trendTitle: '每次请求的 prompt 大小',
    trendTip: 'input + cacheRead，按时间序；命中缓存的部分越多曲线越高',
    trendMeta: (n: number, max: string, last: string, avg: string, sampled: boolean) =>
      `${n} 次请求 · 最大 ${max} · 最新 ${last} · 平均 ${avg}${sampled ? ' · 已抽样' : ''}`,
    noTrend: '暂无请求',
    updatedAt: (t: string) => `更新于 ${t}`,
    loading: '正在读取用量…',
    footer: (schema: string) => `数据源：opencode.db（${schema}）· 费用：DeepSeek=官方峰谷价重算（¥），其他=OpenCode 记账（$）`,
    emptyTitle: '暂无用量数据',
    emptyBody: '该会话还没有助手消息。发出第一条消息后统计会自动出现。',
    notConnected: '未连接会话',
    notConnectedBody: '打开一个会话后，这里会显示该会话的实时用量。',
    serviceDown: '本地服务不可用',
    serviceDownBody: (m: string) => `无法读取用量数据：${m}`,
    retry: '重试',
    dbMissing: '找不到 opencode.db',
    hintToggle: '可切换「仅主会话 / 含子代理」',
    mainOnlyNote: '当前仅统计主会话（不含子代理）',
  },
  en: {
    title: 'Session Usage',
    refresh: 'Refresh',
    scopeAll: 'With subagents',
    scopeMain: 'Main only',
    kpiTotal: 'Total tokens',
    kpiInput: 'Input (miss)',
    kpiOutput: 'Output (incl. reasoning)',
    kpiReasoning: 'Reasoning',
    kpiCacheRead: 'Cache read',
    kpiCacheWrite: 'Cache write',
    kpiHit: 'Cache hit rate',
    kpiRequests: 'Requests',
    kpiCost: 'Cost',
    hitTip: 'cacheRead ÷ (input + cacheRead + cacheWrite); the denominator includes cache writes',
    costTip: (peak: string, off: string, hasDeepseek: boolean) =>
      hasDeepseek
        ? `DeepSeek recomputed at official peak/off-peak prices (CNY; peak ${peak} / off-peak ${off}; cache writes not billed); other models use OpenCode-recorded USD`
        : 'USD as recorded by OpenCode',
    costPeakOff: (peak: string, off: string) => `peak ${peak} · off-peak ${off}`,
    outputTip: (o: string, r: string) => `output ${o}, of which reasoning ${r}`,
    totalTip: (t: string) => `input + output + reasoning + cacheRead + cacheWrite = ${t}`,
    byModel: 'By model',
    children: (n: number) => `Subagent sessions (${n})`,
    childSub: (req: number, hit: string) => `${req} requests · hit ${hit}`,
    childNested: (n: number) => `${n} nested session(s)`,
    trendTitle: 'Prompt size per request',
    trendTip: 'input + cacheRead, in time order; higher when more comes from cache',
    trendMeta: (n: number, max: string, last: string, avg: string, sampled: boolean) =>
      `${n} requests · max ${max} · last ${last} · avg ${avg}${sampled ? ' · sampled' : ''}`,
    noTrend: 'No requests yet',
    updatedAt: (t: string) => `updated ${t}`,
    loading: 'Loading usage…',
    footer: (schema: string) => `Source: opencode.db (${schema}) · cost: DeepSeek = official peak/off-peak CNY; others = OpenCode-recorded USD`,
    emptyTitle: 'No usage yet',
    emptyBody: 'This session has no assistant messages yet. Stats appear after the first reply.',
    notConnected: 'No session',
    notConnectedBody: 'Open a session and its live usage will show up here.',
    serviceDown: 'Local service unavailable',
    serviceDownBody: (m: string) => `Could not read usage data: ${m}`,
    retry: 'Retry',
    dbMissing: 'opencode.db not found',
    hintToggle: 'Toggle "main only / with subagents"',
    mainOnlyNote: 'Showing main session only (subagents excluded)',
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
let scope: Scope = 'total';
let lastReport: Report | null = null;
let lastFetchAt = 0;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

const fmtTokens = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

const fmtUsd = (n: number): string => `$${(n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toFixed(4))}`;

const fmtCny = (n: number): string => `¥${n.toFixed(4)}`;

/** KPI/status 费用文案：纯 DeepSeek → ¥x；混合 → ¥x + $y；无 DeepSeek → $y。 */
const moneyText = (m: Money): string => {
  if (m.hasDeepseek) return m.hasOther ? `${fmtCny(m.costCny)} + ${fmtUsd(m.costUsdOther)}` : fmtCny(m.costCny);
  return fmtUsd(m.cost);
};

/** 按模型行：显示该行自身币种的金额。 */
const modelMoneyText = (m: ModelAgg): string => (m.currency === 'CNY' ? fmtCny(m.amount) : fmtUsd(m.cost));

/** 费用 tooltip：含 DeepSeek 时带峰/谷拆分。 */
const costTipText = (m: Money): string => T().costTip(fmtCny(m.costCnyPeak), fmtCny(m.costCnyOff), m.hasDeepseek);

const fmtPct = (r: number | null): string => (r == null ? '—' : `${(r * 100).toFixed(1)}%`);

const fmtTime = (ts: number): string =>
  ts
    ? new Date(ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';

const fmtDateTime = (ts: number): string =>
  ts
    ? new Date(ts).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

// ---------------------------------------------------------------------------
// DOM 骨架（首次 onReady 时按语言构建）
// ---------------------------------------------------------------------------

let titleEl!: HTMLElement;
let updatedEl!: HTMLElement;
let refreshHandle: ButtonHandle | null = null;
let subEl!: HTMLElement;
let tabsSlot!: HTMLElement;
let tabsHandle: TabsHandle | null = null;
let bannerSlot!: HTMLElement;
let bannerHandle: BannerHandle | null = null;
let bodyEl!: HTMLElement;
let emptySlot!: HTMLElement;
let emptyHandle: EmptyHandle | null = null;

type KpiCell = { card: HTMLElement; value: HTMLElement; sub: HTMLElement };
let kTotal!: KpiCell;
let kInput!: KpiCell;
let kOutput!: KpiCell;
let kReasoning!: KpiCell;
let kCacheRead!: KpiCell;
let kCacheWrite!: KpiCell;
let kHit!: KpiCell;
let kRequests!: KpiCell;
let kCost!: KpiCell;
let modelsEl!: HTMLElement;
let childrenDetails!: HTMLDetailsElement;
let childrenSummary!: HTMLElement;
let childListEl!: HTMLElement;
let trendEl!: HTMLElement;
let footEl!: HTMLElement;

function makeKpi(grid: HTMLElement, label: string, accent = false): KpiCell {
  const card = el('div', accent ? 'card accent' : 'card');
  const k = el('div', 'k', label);
  const value = el('div', 'v', '—');
  const sub = el('div', 'sub', '');
  card.append(k, value, sub);
  grid.append(card);
  return { card, value, sub };
}

function buildDom(): void {
  if (built) return;
  built = true;
  const t = T();

  const wrap = el('div', 'wrap');
  const head = el('div', 'head');
  titleEl = el('div', 'title', t.title);
  updatedEl = el('div', 'updated', '');
  const refreshSlot = el('div', 'refresh-slot');
  head.append(titleEl, updatedEl, refreshSlot);

  subEl = el('div', 'session-line mono');
  tabsSlot = el('div', 'tabs-slot');
  bannerSlot = el('div', 'banner-slot');

  bodyEl = el('div', 'body');
  const cards = el('div', 'cards');
  kTotal = makeKpi(cards, t.kpiTotal);
  kHit = makeKpi(cards, t.kpiHit, true);
  kInput = makeKpi(cards, t.kpiInput);
  kOutput = makeKpi(cards, t.kpiOutput);
  kReasoning = makeKpi(cards, t.kpiReasoning);
  kCacheRead = makeKpi(cards, t.kpiCacheRead);
  kCacheWrite = makeKpi(cards, t.kpiCacheWrite);
  kRequests = makeKpi(cards, t.kpiRequests);
  kCost = makeKpi(cards, t.kpiCost);
  kTotal.card.title = t.totalTip('input + output + reasoning + cacheRead + cacheWrite');
  kHit.card.title = t.hitTip;

  const modelTitle = el('div', 'section', t.byModel);
  modelsEl = el('div', 'models');

  childrenDetails = document.createElement('details');
  childrenDetails.className = 'children';
  childrenSummary = el('summary', '', t.children(0));
  childListEl = el('div', 'child-list');
  childrenDetails.append(childrenSummary, childListEl);

  const trendTitle = el('div', 'section', t.trendTitle);
  trendEl = el('div', 'trend');
  trendEl.title = t.trendTip;

  footEl = el('div', 'foot', '');

  bodyEl.append(cards, modelTitle, modelsEl, childrenDetails, trendTitle, trendEl, footEl);

  emptySlot = el('div', 'empty-slot');

  wrap.append(head, subEl, tabsSlot, bannerSlot, bodyEl, emptySlot);
  root.append(wrap);

  refreshHandle = mountButton(refreshSlot, {
    label: t.refresh,
    size: 'xs',
    variant: 'outline',
    onClick: () => void refresh(),
  });

  tabsHandle = mountTabs(tabsSlot, {
    items: [
      { id: 'total', label: t.scopeAll },
      { id: 'main', label: t.scopeMain },
    ],
    activeId: scope,
    onChange: (id) => {
      scope = id === 'main' ? 'main' : 'total';
      renderBody();
    },
  });
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function setCell(cell: KpiCell, value: string, sub = '', tooltip?: string): void {
  cell.value.textContent = value;
  cell.sub.textContent = sub;
  if (tooltip !== undefined) cell.value.title = tooltip;
}

/** 大数时分两行：紧凑值 + 精确值；小数字只显示一行。 */
function setTokenCell(cell: KpiCell, n: number, tooltip?: string): void {
  setCell(cell, fmtTokens(n), n >= 1000 ? fmtInt(n) : '', tooltip ?? fmtInt(n));
}

function showEmpty(title: string, body: string, action?: { label: string; onClick: () => void }): void {
  if (!built) return;
  emptyHandle?.dispose();
  emptyHandle = mountEmpty(emptySlot, { title, body, action });
  emptySlot.hidden = false;
  bodyEl.hidden = true;
}

function hideEmpty(): void {
  if (!built) return;
  emptyHandle?.dispose();
  emptyHandle = null;
  emptySlot.hidden = true;
  bodyEl.hidden = false;
}

function setBanner(tone: 'info' | 'warning' | 'error', title: string, body: string, retry: boolean): void {
  if (!built) return;
  bannerHandle?.dispose();
  bannerHandle = mountBanner(bannerSlot, {
    tone,
    title,
    body,
    action: retry ? { label: T().retry, onClick: () => void refresh() } : undefined,
  });
}

function clearBanner(): void {
  bannerHandle?.dispose();
  bannerHandle = null;
}

function renderBody(): void {
  const report = lastReport;
  if (!built || !report) return;
  const t = T();
  const agg = scope === 'total' ? report.total : report.main;
  const tok = agg.tokens;

  const totalNum = tok.total;
  setTokenCell(kTotal, totalNum, t.totalTip(fmtInt(totalNum)));
  setTokenCell(kInput, tok.input);
  setTokenCell(kOutput, tok.output + tok.reasoning, t.outputTip(fmtInt(tok.output), fmtInt(tok.reasoning)));
  setTokenCell(kReasoning, tok.reasoning);
  setTokenCell(kCacheRead, tok.cacheRead);
  setTokenCell(kCacheWrite, tok.cacheWrite);
  setCell(kHit, fmtPct(agg.hitRate), '');
  setCell(kRequests, fmtInt(agg.requests), '');
  setCell(kCost, moneyText(agg), '', costTipText(agg));

  // 按模型
  modelsEl.textContent = '';
  if (!agg.byModel.length) {
    modelsEl.append(el('div', 'muted', '—'));
  } else {
    for (const m of agg.byModel) {
      const row = el('div', 'model');
      const left = el('div');
      left.append(el('div', 'm-name', m.model), el('div', 'm-sub', `${m.provider || '?'} · ${fmtInt(m.requests)} ×`));
      const right = el('div', 'm-right');
      const costEl = el('div', 'm-cost', modelMoneyText(m));
      if (m.official) costEl.title = t.costPeakOff(fmtCny(m.official.peakCny), fmtCny(m.official.offCny));
      right.append(el('div', 'm-tokens', fmtTokens(m.tokens.total)), costEl);
      row.append(left, right);
      modelsEl.append(row);
    }
  }

  // 子会话明细
  const showChildren = scope === 'total' && report.children.length > 0;
  childrenDetails.hidden = !showChildren;
  if (showChildren) {
    childrenSummary.textContent = t.children(report.children.length);
    childListEl.textContent = '';
    for (const c of report.children) {
      const row = el('div', 'child');
      const left = el('div');
      const sub = t.childSub(c.requests, fmtPct(c.hitRate)) + (c.descendants > 0 ? ` · ${t.childNested(c.descendants)}` : '');
      left.append(el('div', 'm-name', c.title || c.id), el('div', 'c-sub', sub));
      const right = el('div', 'c-right');
      const costEl = el('div', 'c-cost', moneyText(c));
      if (c.hasDeepseek) costEl.title = costTipText(c);
      right.append(el('div', 'c-tokens', fmtTokens(c.tokens.total)), costEl);
      row.append(left, right);
      childListEl.append(row);
    }
  }

  // 曲线
  renderTrend(trendEl, agg.trend);

  // 头部信息
  subEl.textContent = `${report.session.title || report.session.id} · ${report.session.id}`;
  tabsHandle?.update({
    items: [
      { id: 'total', label: t.scopeAll, count: report.children.length },
      { id: 'main', label: t.scopeMain },
    ],
    activeId: scope,
  });
  footEl.textContent = t.footer(report.db.schema);
}

function renderTrend(container: HTMLElement, trend: Agg['trend']): void {
  const t = T();
  container.textContent = '';
  const pts = trend.points;
  if (!pts.length) {
    container.append(el('div', 'muted', t.noTrend));
    return;
  }
  const W = 600;
  const H = 120;
  const PAD = 8;
  const vals = pts.map((p) => p[1]);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max === min) max = min + 1;
  const x = (i: number): number => PAD + ((W - 2 * PAD) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)));
  const y = (v: number): number => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD);
  const coords = pts.map((p, i) => [x(i), y(p[1])] as const);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');

  const area = document.createElementNS(NS, 'path');
  const areaD =
    `M ${coords[0][0].toFixed(1)} ${(H - PAD).toFixed(1)} L ` +
    coords.map((c) => `${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' L ') +
    ` L ${coords[coords.length - 1][0].toFixed(1)} ${(H - PAD).toFixed(1)} Z`;
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'currentColor');
  area.setAttribute('opacity', '0.12');

  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', coords.map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');

  svg.append(area, line);
  container.append(svg);

  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  container.append(el('div', 'trend-meta', t.trendMeta(pts.length, fmtTokens(max), fmtTokens(vals[vals.length - 1]), fmtTokens(avg), trend.downsampled)));
  const times = el('div', 'trend-times');
  times.append(el('span', '', fmtTime(pts[0][0])), el('span', '', fmtTime(pts[pts.length - 1][0])));
  container.append(times);
}

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------

type LoadError = { title: string; message: string; retry: boolean };

async function fetchReport(sid: string): Promise<{ report?: Report; empty?: boolean; error?: LoadError }> {
  if (MOCK) return { report: mockReport(sid) };
  let res: { status: number; body: string };
  try {
    res = await host.serviceRequest({ method: 'GET', path: '/session', query: { sessionId: sid } });
  } catch (err) {
    return {
      error: { title: T().serviceDown, message: T().serviceDownBody(err instanceof Error ? err.message : String(err)), retry: true },
    };
  }
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  if (res.status === 200 && payload && payload.ok) return { report: payload as unknown as Report };
  const code = typeof payload?.error === 'string' ? (payload.error as string) : 'unknown';
  const message = typeof payload?.message === 'string' ? (payload.message as string) : '';
  if (res.status === 404 && code === 'session-not-found') return { empty: true };
  if (res.status === 503 && code === 'db-missing') {
    return { error: { title: T().dbMissing, message: message || code, retry: true } };
  }
  return {
    error: {
      title: T().serviceDown,
      message: T().serviceDownBody(message || `${res.status} ${code}`),
      retry: true,
    },
  };
}

async function refresh(): Promise<void> {
  if (!built || loading) return;
  loading = true;
  refreshHandle?.update({ loading: true });
  updatedEl.textContent = lastReport ? updatedEl.textContent : T().loading;
  try {
    if (sessionId == null) {
      lastReport = null;
      clearBanner();
      showEmpty(T().notConnected, T().notConnectedBody);
      return;
    }
    const result = await fetchReport(sessionId);
    if (result.report) {
      lastReport = result.report;
      lastFetchAt = Date.now();
      clearBanner();
      hideEmpty();
      renderBody();
      updatedEl.textContent = T().updatedAt(fmtTime(lastFetchAt));
    } else if (result.empty) {
      lastReport = null;
      clearBanner();
      showEmpty(T().emptyTitle, T().emptyBody);
      updatedEl.textContent = '';
    } else if (result.error) {
      clearBanner();
      setBanner('error', result.error.title, result.error.message, result.error.retry);
      if (!lastReport) showEmpty(result.error.title, result.error.message, { label: T().retry, onClick: () => void refresh() });
    }
  } finally {
    loading = false;
    refreshHandle?.update({ loading: false });
  }
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function boot(): void {
  if (booted) return;
  booted = true;
  void refresh();
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastFetchAt > 15_000) void refresh();
  });
}

function applyHostSession(sid: string | null): void {
  if (sid === sessionId) return;
  sessionId = sid;
  lastReport = null;
  if (!built) return;
  renderBodyPlaceholder();
  void refresh();
}

function renderBodyPlaceholder(): void {
  if (sessionId == null) showEmpty(T().notConnected, T().notConnectedBody);
  else if (!lastReport) showEmpty(T().loading, '');
}

if (MOCK) {
  lang = detectLang(params.get('lang') ?? undefined);
  document.documentElement.style.colorScheme = params.get('theme') === 'light' ? 'light' : 'dark';
  const dark = params.get('theme') !== 'light';
  document.documentElement.style.background = dark ? '#15171c' : '#ffffff';
  document.body.style.color = dark ? '#e8e8ea' : '#1b1b1f';
  document.body.style.minHeight = '100vh';
  sessionId = 'ses_mock000000000000000000000000';
  buildDom();
  lastReport = mockReport(sessionId);
  hideEmpty();
  renderBody();
  updatedEl.textContent = T().updatedAt(fmtTime(Date.now()));
} else {
  host.onReady((ctx) => {
    applyHostReady(ctx, document.documentElement);
    lang = detectLang(ctx.locale);
    buildDom();
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
      showEmpty(T().notConnected, T().notConnectedBody);
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// mock（?mock=1 预览用）
// ---------------------------------------------------------------------------

function mockReport(sid: string): Report {
  const now = Date.now();
  const points: Array<[number, number]> = [];
  let p = 9000;
  for (let i = 0; i < 96; i++) {
    p = Math.max(2500, p * (0.9 + Math.random() * 0.22));
    points.push([now - (96 - i) * 40_000, Math.round(p)]);
  }
  const tok = (input: number, output: number, reasoning: number, cacheRead: number, cacheWrite: number): Tokens => ({
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: input + output + reasoning + cacheRead + cacheWrite,
  });
  const hit = (t: Tokens): number => t.cacheRead / (t.input + t.cacheRead + t.cacheWrite);

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

  const dsMain: ModelAgg = {
    model: 'deepseek-flash',
    provider: 'deepseek',
    requests: 71,
    tokens: tok(470000, 24000, 180000, 5600000, 0),
    cost: 0.2,
    currency: 'CNY',
    amount: 0.4193,
    official: { cny: 0.4193, peakCny: 0.1564, offCny: 0.2629 },
  };
  const otherMain: ModelAgg = {
    model: 'grok-4.7',
    provider: 'xai',
    requests: 6,
    tokens: tok(37271, 3357, 14259, 209920, 0),
    cost: 0.02649,
    currency: 'USD',
    amount: 0.02649,
    official: null,
  };
  const dsTotal: ModelAgg = {
    ...dsMain,
    requests: 88,
    tokens: tok(1000000, 30000, 190000, 6000000, 0),
    amount: 0.4528,
    official: { cny: 0.4528, peakCny: 0.1689, offCny: 0.2839 },
  };
  const otherTotal: ModelAgg = { ...otherMain, requests: 8, tokens: tok(60000, 5000, 16000, 220000, 0), amount: 0.02624 };

  const mainTok = tok(507271, 27357, 194259, 5809920, 0);
  const childTok = tok(54820, 5858, 11805, 310016, 0);
  const totalTok = tok(
    mainTok.input + childTok.input,
    mainTok.output + childTok.output,
    mainTok.reasoning + childTok.reasoning,
    mainTok.cacheRead + childTok.cacheRead,
    mainTok.cacheWrite + childTok.cacheWrite,
  );

  const mkChild = (
    id: string,
    title: string,
    startedAt: number,
    lastMessageAt: number,
    requests: number,
    tokens: Tokens,
    rate: number,
    m: Money,
  ): ChildAgg => ({ ...m, id, title, startedAt, lastMessageAt, requests, tokens, hitRate: rate, descendants: 0 });

  return {
    ok: true,
    generatedAt: now,
    db: { path: '~/.local/share/opencode/opencode.db', schema: 'v2' },
    session: {
      id: sid,
      title: '网页版 LLM 与 API Agent 搜索差异原因',
      parentId: null,
      startedAt: now - 5_400_000,
      lastMessageAt: now - 60_000,
      childCount: 2,
      descendantCount: 2,
    },
    main: {
      ...money(0.4193, 0.1564, 0.2629, 0.02649, (ds ? 0.2 : 0) + (ot ? 0.02649 : 0)),
      requests: 77,
      tokens: mainTok,
      hitRate: hit(mainTok),
      byModel: [...(ds ? [dsMain] : []), ...(ot ? [otherMain] : [])],
      trend: { points: points.slice(0, 77), downsampled: false },
    },
    total: {
      ...money(0.4528, 0.1689, 0.2839, 0.02624, (ds ? 0.22 : 0) + (ot ? 0.02624 : 0)),
      requests: 96,
      tokens: totalTok,
      hitRate: hit(totalTok),
      byModel: [...(ds ? [dsTotal] : []), ...(ot ? [otherTotal] : [])],
      trend: { points, downsampled: false },
    },
    children: [
      mkChild(
        'ses_mockchild1',
        '插话与子会话查证',
        now - 3_600_000,
        now - 1_800_000,
        11,
        tok(47774, 3689, 10967, 270592, 0),
        0.85,
        ds ? money(0.0119, 0.0044, 0.0075, 0, 0.0119) : money(0, 0, 0, 0.01677, 0.01677),
      ),
      mkChild(
        'ses_mockchild2',
        '会话存储结构调查',
        now - 1_500_000,
        now - 900_000,
        8,
        tok(7046, 2169, 838, 39424, 0),
        0.85,
        ot ? money(0, 0, 0, 0.00298, 0.00298) : money(0.0034, 0.0011, 0.0023, 0, 0.0034),
      ),
    ],
  };
}
