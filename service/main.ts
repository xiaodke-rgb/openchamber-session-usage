/**
 * session-usage 本地服务
 *
 * 只读读取本机 opencode.db（OpenCode 2.x：session_v2 / session_message；1.x：session / message），
 * 按「当前会话 + 递归子代理子会话」聚合 token、缓存命中与费用：
 *   - DeepSeek 模型按官方峰谷价重算人民币（价目/时段逻辑与 deepseek-usage 扩展一致）
 *   - 其他模型沿用 OpenCode 记录的 USD cost
 *   不做汇率换算、不联网。
 *
 * 路由：
 *   GET /health
 *   GET /session?sessionId=ses_xxx
 */
import { createServer, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT || 0);
const TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN || '';

const TTL_MS = 15_000; // 快照缓存：面板约 15s 轮询，命中即返回
const IDLE_RELEASE_MS = 10 * 60_000; // 10 分钟无请求释放内存
const OVERLAP_MS = 10 * 60_000; // 增量刷新回扫窗口（消息可能持续写入、费用稍后结算）
const TREND_MAX_POINTS = 1500; // 曲线点上限，超出按步长抽样
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

type Schema = 'v2' | 'v1';

type Tokens = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

type UsageRow = {
  id: string;
  sid: string;
  ts: number;
  model: string;
  provider: string;
  tokens: Tokens;
  cost: number;
};

type SessionMeta = { parentId: string | null; title: string; created: number };

type UsageData = {
  schema: Schema;
  dbPath: string;
  rows: UsageRow[];
  index: Map<string, number>; // 消息 id -> rows 下标
  meta: Map<string, SessionMeta>;
  children: Map<string, string[]>; // parent_id -> 子会话 id
};

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  return 0;
};

const emptyTokens = (): Tokens => ({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 });
const tokenTotal = (t: Tokens): number => t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
const addTokens = (into: Tokens, add: Tokens): void => {
  into.input += add.input;
  into.output += add.output;
  into.reasoning += add.reasoning;
  into.cacheRead += add.cacheRead;
  into.cacheWrite += add.cacheWrite;
};

/** 命中率分母：input + cacheRead + cacheWrite（含缓存写）。 */
const hitRate = (t: Tokens): number | null => {
  const denom = t.input + t.cacheRead + t.cacheWrite;
  return denom > 0 ? t.cacheRead / denom : null;
};

// ---------------------------------------------------------------------------
// 费用口径
// DeepSeek 消息按官方峰谷价重算人民币（价目表与峰谷算法原样取自
// /home/xiaodke/.config/openchamber/extensions/deepseek-usage/service/main.ts）；
// 其余模型沿用 OpenCode 记录的 USD cost。不做汇率换算、不联网。
// ---------------------------------------------------------------------------

type Tier = 'flash' | 'pro';

interface TierPrice {
  hitOff: number;
  hitPeak: number;
  missOff: number;
  missPeak: number;
  outOff: number;
  outPeak: number;
}

/** 元 / 1M tokens，来自 DeepSeek 官方中文价目（与 deepseek-usage 一致） */
const PRICING: Record<Tier, TierPrice> = {
  flash: { hitOff: 0.02, hitPeak: 0.04, missOff: 1, missPeak: 2, outOff: 4, outPeak: 8 },
  pro: { hitOff: 0.15, hitPeak: 0.3, missOff: 4.5, missPeak: 9, outOff: 13.5, outPeak: 27 },
};

const PEAK_WINDOW_UTC = '周一至周五 01:00–04:00、06:00–10:00 UTC';
const PEAK_WINDOW_LOCAL = '北京时间 09:00–12:00、14:00–18:00';

function tierOf(model: string): Tier | null {
  const m = model.toLowerCase();
  if (!m.startsWith('deepseek')) return null;
  return m.includes('pro') ? 'pro' : 'flash';
}

/** 峰时：UTC 周一至周五 01:00–04:00、06:00–10:00；其余为谷时（半价）。不处理节假日。 */
function isPeak(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = date.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

/** DeepSeek 官方价（元）：input 按未命中、cacheRead 按命中、output+reasoning 按输出价；缓存写不计费。 */
function messageOfficialCost(tokens: Tokens, tier: Tier | null, peak: boolean): number {
  if (!tier) return 0;
  const p = PRICING[tier];
  const hit = peak ? p.hitPeak : p.hitOff;
  const miss = peak ? p.missPeak : p.missOff;
  const out = peak ? p.outPeak : p.outOff;
  return (tokens.input * miss + tokens.cacheRead * hit + (tokens.output + tokens.reasoning) * out) / 1e6;
}

function findDb(): string | null {
  const fromEnv = process.env.OPENCODE_DB;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null; // 显式指定但不存在 → db-missing
  const def = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');
  return existsSync(def) ? def : null;
}

function openDb(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath, { readOnly: true });
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  return !!row;
}

function tableCount(db: DatabaseSync, name: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n?: number } | undefined;
  return num(row?.n);
}

function detectSchema(db: DatabaseSync): Schema | null {
  const hasV2 = tableExists(db, 'session_v2') && tableExists(db, 'session_message');
  if (hasV2 && tableCount(db, 'session_message') > 0) return 'v2';
  const hasV1 = tableExists(db, 'session') && tableExists(db, 'message');
  if (hasV1 && tableCount(db, 'message') > 0) return 'v1';
  return hasV2 ? 'v2' : null;
}

/** assistant 消息里的 token / 费用字段。v2 与 v1 的 tokens 结构一致，仅模型字段名不同。 */
const ROW_SELECT_V2 = `
SELECT id,
  session_id AS sid,
  time_created AS ts,
  json_extract(data,'$.model.id') AS model,
  json_extract(data,'$.model.providerID') AS provider,
  json_extract(data,'$.tokens.input') AS input,
  json_extract(data,'$.tokens.output') AS output,
  json_extract(data,'$.tokens.reasoning') AS reasoning,
  json_extract(data,'$.tokens.cache.read') AS cache_read,
  json_extract(data,'$.tokens.cache.write') AS cache_write,
  json_extract(data,'$.cost') AS cost
FROM session_message
WHERE type='assistant'`;

const ROW_SELECT_V1 = `
SELECT id,
  session_id AS sid,
  time_created AS ts,
  json_extract(data,'$.modelID') AS model,
  json_extract(data,'$.providerID') AS provider,
  json_extract(data,'$.tokens.input') AS input,
  json_extract(data,'$.tokens.output') AS output,
  json_extract(data,'$.tokens.reasoning') AS reasoning,
  json_extract(data,'$.tokens.cache.read') AS cache_read,
  json_extract(data,'$.tokens.cache.write') AS cache_write,
  json_extract(data,'$.cost') AS cost
FROM message
WHERE json_extract(data,'$.role')='assistant'`;

function rowToUsage(raw: Record<string, unknown>): UsageRow | null {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  const model = typeof raw.model === 'string' && raw.model ? raw.model : 'unknown';
  const provider = typeof raw.provider === 'string' ? raw.provider : '';
  return {
    id,
    sid: typeof raw.sid === 'string' ? raw.sid : '',
    ts: num(raw.ts),
    model,
    provider,
    tokens: {
      input: num(raw.input),
      output: num(raw.output),
      reasoning: num(raw.reasoning),
      cacheRead: num(raw.cache_read),
      cacheWrite: num(raw.cache_write),
    },
    cost: num(raw.cost),
  };
}

/** 全量或增量（time_created >= sinceMs）读取 assistant 消息。全模型，无 LIKE 过滤。 */
function loadRows(db: DatabaseSync, schema: Schema, sinceMs?: number): UsageRow[] {
  const base = schema === 'v2' ? ROW_SELECT_V2 : ROW_SELECT_V1;
  const sql = typeof sinceMs === 'number' ? `${base} AND time_created >= ?` : base;
  const stmt = db.prepare(sql);
  const raw = (typeof sinceMs === 'number' ? stmt.all(sinceMs) : stmt.all()) as Record<string, unknown>[];
  const rows: UsageRow[] = [];
  for (const r of raw) {
    const row = rowToUsage(r);
    if (row && row.sid) rows.push(row);
  }
  return rows;
}

function loadMeta(db: DatabaseSync, schema: Schema): { meta: Map<string, SessionMeta>; children: Map<string, string[]> } {
  const table = schema === 'v2' ? 'session_v2' : 'session';
  const raw = db.prepare(`SELECT id, parent_id AS parentId, title, time_created AS created FROM ${table}`).all() as Record<
    string,
    unknown
  >[];
  const meta = new Map<string, SessionMeta>();
  const children = new Map<string, string[]>();
  for (const r of raw) {
    const id = typeof r.id === 'string' ? r.id : null;
    if (!id) continue;
    const parentId = typeof r.parentId === 'string' && r.parentId ? r.parentId : null;
    meta.set(id, {
      parentId,
      title: typeof r.title === 'string' && r.title ? r.title : '',
      created: num(r.created),
    });
    if (parentId) {
      const list = children.get(parentId);
      if (list) list.push(id);
      else children.set(parentId, [id]);
    }
  }
  return { meta, children };
}

function loadFull(dbPath: string): UsageData {
  const db = openDb(dbPath);
  try {
    const schema = detectSchema(db);
    if (!schema) throw new HttpError(503, 'db-empty', '数据库中没有 OpenCode 会话表');
    const rows = loadRows(db, schema);
    const { meta, children } = loadMeta(db, schema);
    const index = new Map<string, number>();
    rows.forEach((r, i) => index.set(r.id, i));
    return { schema, dbPath, rows, index, meta, children };
  } finally {
    db.close();
  }
}

/** 增量刷新：回扫最近 OVERLAP_MS 的行并合并（消息按 id 覆盖）；表结构变化时返回 null 触发全量。 */
function refreshIncremental(prev: UsageData): UsageData | null {
  const db = openDb(prev.dbPath);
  try {
    const schema = detectSchema(db);
    if (schema !== prev.schema) return null;
    let lastTs = 0;
    for (const r of prev.rows) if (r.ts > lastTs) lastTs = r.ts;
    const since = Math.max(0, lastTs - OVERLAP_MS);
    for (const row of loadRows(db, schema, since)) {
      const at = prev.index.get(row.id);
      if (at === undefined) {
        prev.index.set(row.id, prev.rows.length);
        prev.rows.push(row);
      } else {
        prev.rows[at] = row;
      }
    }
    const { meta, children } = loadMeta(db, schema);
    prev.meta = meta;
    prev.children = children;
    return prev;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// 快照缓存（15s TTL + 10 分钟空闲释放）
// ---------------------------------------------------------------------------

let cached: { data: UsageData; at: number; usedAt: number; dbPath: string } | null = null;

function getData(): UsageData {
  const dbPath = findDb();
  if (!dbPath) {
    const hinted = process.env.OPENCODE_DB || '~/.local/share/opencode/opencode.db';
    throw new HttpError(503, 'db-missing', `找不到 opencode.db（${hinted}）`);
  }
  const now = Date.now();
  if (cached && cached.dbPath === dbPath && now - cached.at < TTL_MS) {
    cached.usedAt = now;
    return cached.data;
  }
  if (cached && cached.dbPath === dbPath) {
    try {
      const kept = refreshIncremental(cached.data);
      if (kept) {
        cached.at = now;
        cached.usedAt = now;
        return kept;
      }
    } catch {
      // 增量失败则退回全量；全量也失败时保留旧快照（下面处理）
    }
  }
  try {
    const data = loadFull(dbPath);
    cached = { data, at: now, usedAt: now, dbPath };
    return data;
  } catch (err) {
    if (cached && cached.dbPath === dbPath) {
      cached.at = now - TTL_MS + 3000; // 3 秒后重试
      cached.usedAt = now;
      return cached.data;
    }
    throw err;
  }
}

const idleTimer = setInterval(() => {
  if (cached && Date.now() - cached.usedAt > IDLE_RELEASE_MS) cached = null;
}, 60_000);
idleTimer.unref();

// ---------------------------------------------------------------------------
// 聚合
// ---------------------------------------------------------------------------

type ModelFold = {
  model: string;
  provider: string;
  requests: number;
  tokens: Tokens;
  cost: number; // OpenCode 记账 USD
  tier: Tier | null;
  cny: number; // DeepSeek 官方价人民币（非 DeepSeek 恒为 0）
  peakCny: number;
  offCny: number;
};

type Fold = {
  requests: number;
  tokens: Tokens;
  cost: number; // OpenCode 记账 USD（全部消息，原字段语义不变）
  cny: number; // DeepSeek 官方价人民币合计
  peakCny: number;
  offCny: number;
  usdOther: number; // 非 DeepSeek 消息的 OpenCode 记账 USD
  hasDeepseek: boolean;
  hasOther: boolean;
  models: Map<string, ModelFold>;
};

function foldRows(rows: UsageRow[]): Fold {
  const fold: Fold = {
    requests: 0,
    tokens: emptyTokens(),
    cost: 0,
    cny: 0,
    peakCny: 0,
    offCny: 0,
    usdOther: 0,
    hasDeepseek: false,
    hasOther: false,
    models: new Map(),
  };
  for (const row of rows) {
    const tier = tierOf(row.model);
    const peak = tier !== null && row.ts > 0 ? isPeak(new Date(row.ts)) : false;
    const cny = messageOfficialCost(row.tokens, tier, peak);

    fold.requests += 1;
    addTokens(fold.tokens, row.tokens);
    fold.cost += row.cost;
    if (tier) {
      fold.hasDeepseek = true;
      fold.cny += cny;
      if (peak) fold.peakCny += cny;
      else fold.offCny += cny;
    } else {
      fold.hasOther = true;
      fold.usdOther += row.cost;
    }

    const key = `${row.provider}/${row.model}`;
    let m = fold.models.get(key);
    if (!m) {
      m = {
        model: row.model,
        provider: row.provider,
        requests: 0,
        tokens: emptyTokens(),
        cost: 0,
        tier,
        cny: 0,
        peakCny: 0,
        offCny: 0,
      };
      fold.models.set(key, m);
    }
    m.requests += 1;
    addTokens(m.tokens, row.tokens);
    m.cost += row.cost;
    if (tier) {
      m.cny += cny;
      if (peak) m.peakCny += cny;
      else m.offCny += cny;
    }
  }
  return fold;
}

function toAgg(fold: Fold) {
  return {
    requests: fold.requests,
    tokens: { ...fold.tokens, total: tokenTotal(fold.tokens) },
    cost: fold.cost, // OpenCode 记账 USD（全部消息）
    costCny: fold.cny, // DeepSeek 官方峰谷价人民币合计
    costCnyPeak: fold.peakCny,
    costCnyOff: fold.offCny,
    costUsdOther: fold.usdOther, // 非 DeepSeek 的 OpenCode 记账 USD
    hasDeepseek: fold.hasDeepseek,
    hasOther: fold.hasOther,
    hitRate: hitRate(fold.tokens),
  };
}

function modelsOf(fold: Fold) {
  return [...fold.models.values()]
    .map((m) => ({
      model: m.model,
      provider: m.provider,
      requests: m.requests,
      tokens: { ...m.tokens, total: tokenTotal(m.tokens) },
      cost: m.cost, // 原字段：OpenCode 记账 USD
      currency: m.tier ? ('CNY' as const) : ('USD' as const), // 该行展示币种
      amount: m.tier ? m.cny : m.cost, // 该行展示金额（自身币种）
      official: m.tier ? { cny: m.cny, peakCny: m.peakCny, offCny: m.offCny } : null,
    }))
    .sort((a, b) => b.amount - a.amount || b.tokens.total - a.tokens.total || a.model.localeCompare(b.model));
}

/** 每次请求的 prompt 大小（input + cacheRead），按时间序；超上限按步长抽样，保留最后一个点。 */
function buildTrend(rows: UsageRow[]): { points: Array<[number, number]>; downsampled: boolean } {
  const sorted = rows.slice().sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  const all = sorted.map((r) => [r.ts, r.tokens.input + r.tokens.cacheRead] as [number, number]);
  if (all.length <= TREND_MAX_POINTS) return { points: all, downsampled: false };
  const step = Math.ceil(all.length / TREND_MAX_POINTS);
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < all.length; i += step) sampled.push(all[i]);
  const last = all[all.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return { points: sampled, downsampled: true };
}

function buildSessionReport(data: UsageData, sessionId: string) {
  const meta = data.meta.get(sessionId);
  if (!meta) return null;

  const directChildren = data.children.get(sessionId) ?? [];

  // 全部后代（BFS，防环）
  const descendants = new Set<string>();
  const stack = [...directChildren];
  while (stack.length) {
    const id = stack.pop() as string;
    if (descendants.has(id)) continue;
    descendants.add(id);
    for (const c of data.children.get(id) ?? []) stack.push(c);
  }

  const mainRows: UsageRow[] = [];
  const treeRows: UsageRow[] = [];
  const childBuckets = new Map<string, UsageRow[]>();
  for (const id of directChildren) childBuckets.set(id, []);

  // 主会话行 + 子代理行（归到所属的一级子会话桶）
  for (const row of data.rows) {
    if (row.sid === sessionId) {
      mainRows.push(row);
      treeRows.push(row);
      continue;
    }
    if (!descendants.has(row.sid)) continue;
    treeRows.push(row);
    let cur = row.sid;
    let guard = 0;
    while (guard++ < 64) {
      const m = data.meta.get(cur);
      if (!m || !m.parentId) break;
      if (m.parentId === sessionId) {
        childBuckets.get(cur)?.push(row);
        break;
      }
      cur = m.parentId;
    }
  }

  const foldMain = foldRows(mainRows);
  const foldTotal = foldRows(treeRows);

  let lastMessageAt = 0;
  for (const r of treeRows) if (r.ts > lastMessageAt) lastMessageAt = r.ts;

  const children = directChildren
    .map((id) => {
      const cm = data.meta.get(id);
      const rows = childBuckets.get(id) ?? [];
      const fold = foldRows(rows);
      let lastChildTs = 0;
      for (const r of rows) if (r.ts > lastChildTs) lastChildTs = r.ts;
      return {
        id,
        title: cm?.title ?? '',
        startedAt: cm?.created ?? 0,
        lastMessageAt: lastChildTs,
        requests: fold.requests,
        tokens: { ...fold.tokens, total: tokenTotal(fold.tokens) },
        cost: fold.cost,
        costCny: fold.cny,
        costCnyPeak: fold.peakCny,
        costCnyOff: fold.offCny,
        costUsdOther: fold.usdOther,
        hasDeepseek: fold.hasDeepseek,
        hasOther: fold.hasOther,
        hitRate: hitRate(fold.tokens),
        descendants: descendantCount(data, id) - 1,
      };
    })
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));

  const mainTrend = buildTrend(mainRows);
  const totalTrend = buildTrend(treeRows);

  return {
    ok: true as const,
    generatedAt: Date.now(),
    db: { path: data.dbPath, schema: data.schema },
    pricing: {
      peakWindowUtc: PEAK_WINDOW_UTC,
      peakWindowLocal: PEAK_WINDOW_LOCAL,
      cnyPerMillion: PRICING,
      note: 'DeepSeek 消息按官方峰谷价重算人民币（缓存写不计费）；其他模型为 OpenCode 记账 USD；不做汇率换算。',
    },
    session: {
      id: sessionId,
      title: meta.title,
      parentId: meta.parentId,
      startedAt: meta.created,
      lastMessageAt,
      childCount: directChildren.length,
      descendantCount: descendants.size,
    },
    main: { ...toAgg(foldMain), byModel: modelsOf(foldMain), trend: mainTrend },
    total: { ...toAgg(foldTotal), byModel: modelsOf(foldTotal), trend: totalTrend },
    children,
  };
}

function descendantCount(data: UsageData, rootId: string): number {
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const c of data.children.get(id) ?? []) {
      if (!seen.has(c)) {
        seen.add(c);
        stack.push(c);
      }
    }
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer((req, res) => {
  try {
    if (TOKEN) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${TOKEN}`) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (url.pathname === '/session') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
        return;
      }
      const sessionId = url.searchParams.get('sessionId') ?? '';
      if (!SESSION_ID_RE.test(sessionId)) {
        sendJson(res, 400, { ok: false, error: 'bad-request', message: 'sessionId 无效' });
        return;
      }
      const data = getData();
      const report = buildSessionReport(data, sessionId);
      if (!report) {
        sendJson(res, 404, { ok: false, error: 'session-not-found', message: '数据库中还没有这个会话' });
        return;
      }
      sendJson(res, 200, report);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not-found' });
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { ok: false, error: err.code, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { ok: false, error: 'internal', message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[session-usage] service listening on 127.0.0.1:${PORT}`);
});
