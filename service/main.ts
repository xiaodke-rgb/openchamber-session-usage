/**
 * session-usage 本地服务
 *
 * 只读读取本机 opencode.db（OpenCode 2.x：session_v2 / session_message；1.x：session / message），
 * 按「当前会话 + 递归子代理子会话」聚合 token、缓存命中与费用：
 *   - 计费白名单（~/.config/openchamber/session-usage.json 里的 provider/model）按 DeepSeek
 *     官方峰谷价重算人民币（价目/时段逻辑与 deepseek-usage 扩展一致，周末与法定节假日按谷价）
 *   - 其余模型沿用 OpenCode 记录的 USD cost（免费模型即 0）
 *   不做汇率换算；除用户主动触发的 /holidays/sync 外不联网。
 *
 * 路由：
 *   GET  /health
 *   GET  /session?sessionId=ses_xxx
 *   GET  /config                       计费配置 + 模型清单 + 节假日状态
 *   PUT  /config                       { billingModels?, holidays? }
 *   POST /holidays/sync                联网同步中国法定节假日（用户主动触发）
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import BUILTIN_HOLIDAYS from './holidays.json';

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

type SessionMeta = {
  parentId: string | null;
  title: string;
  created: number;
  /** session_v2.fork_session_id：非空表示这个会话是从别的会话 fork 出来的 */
  forkSessionId: string | null;
};

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
// 白名单（~/.config/openchamber/session-usage.json 的 billingModels）里的 provider/model
// 按 DeepSeek 官方峰谷价重算人民币（价目表与峰谷算法原样取自
// /home/xiaodke/.config/openchamber/extensions/deepseek-usage/service/main.ts）；
// 不在白名单里的一律沿用 OpenCode 记录的 USD cost（免费模型即 0）。不做汇率换算。
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
const PEAK_WINDOW_LOCAL = '北京时间 09:00–12:00、14:00–18:00（周末与中国法定节假日全天为谷价）';

/** 档位只看模型 id：以 deepseek 开头、含 pro 走 pro 档，否则 flash 档。 */
function tierOf(model: string): Tier | null {
  const m = model.toLowerCase();
  if (!m.startsWith('deepseek')) return null;
  return m.includes('pro') ? 'pro' : 'flash';
}

/** 免费模型（id 含 free，如 opencode 家的 deepseek-v4.1-flash-free）永远不按官方价算。 */
const isFreeModel = (model: string): boolean => model.toLowerCase().includes('free');

/** 旧规则（deepseek* 且非 free）——只在首次运行时用来生成白名单默认值。 */
const legacyOfficial = (model: string): boolean => {
  const m = model.trim().toLowerCase();
  return m.startsWith('deepseek') && !m.includes('free');
};

// ---- 计费白名单配置 --------------------------------------------------------

type BillingModel = { provider: string; model: string };

type Config = {
  version: 1;
  /** 首次运行按旧规则播过种没有；用户动过配置后不再自动播种 */
  seeded: boolean;
  /** 走 DeepSeek 官方峰谷计费的 provider/model */
  billingModels: BillingModel[];
  /** 手工追加的法定节假日日期（YYYY-MM-DD），叠加在内置清单之上 */
  holidays: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'openchamber');
const CONFIG_FILE = process.env.SESSION_USAGE_CONFIG || join(CONFIG_DIR, 'session-usage.json');
const HOLIDAY_CACHE_FILE = join(CONFIG_DIR, 'session-usage-holidays.json');

const emptyConfig = (): Config => ({ version: 1, seeded: false, billingModels: [], holidays: [] });

const pairKey = (provider: string, model: string): string =>
  `${provider.trim().toLowerCase()}/${model.trim().toLowerCase()}`;

function normalizeRule(value: unknown): BillingModel | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  if (!model || model.length > 200 || provider.length > 200) return null;
  return { provider, model };
}

function readConfigFile(): Config {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
  } catch {
    return emptyConfig();
  }
  const rules = Array.isArray(raw.billingModels) ? raw.billingModels : [];
  const holidays = Array.isArray(raw.holidays)
    ? raw.holidays.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d))
    : [];
  return {
    version: 1,
    seeded: raw.seeded === true,
    billingModels: rules.map(normalizeRule).filter((r): r is BillingModel => r !== null),
    holidays,
  };
}

function configSignature(): string {
  try {
    const s = statSync(CONFIG_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return 'missing';
  }
}

let cfgMemo: { config: Config; signature: string } | null = null;
let billingPairs = new Set<string>();
let billingModelOnly = new Set<string>();

/** 刷新白名单索引（免费模型与认不出档位的模型不进官方计费）。 */
function applyConfig(config: Config): Config {
  const pairs = new Set<string>();
  const models = new Set<string>();
  for (const rule of config.billingModels) {
    if (isFreeModel(rule.model) || !tierOf(rule.model)) continue;
    models.add(rule.model.trim().toLowerCase());
    pairs.add(pairKey(rule.provider, rule.model));
  }
  billingPairs = pairs;
  billingModelOnly = models;
  return config;
}

/** 读配置（按文件 mtime 复用），顺带刷新白名单索引。 */
function getConfig(): Config {
  const signature = configSignature();
  if (cfgMemo && cfgMemo.signature === signature) return cfgMemo.config;
  const config = applyConfig(readConfigFile());
  cfgMemo = { config, signature };
  return config;
}

/** 写配置（原子替换）；写盘失败会抛错，由路由转成 500。 */
function setConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(tmp, CONFIG_FILE);
  const applied = applyConfig(config);
  cfgMemo = { config: applied, signature: configSignature() };
}

/** 首次运行：把「按旧规则本来就走官方计费」的模型写进白名单（deepseek* 且非 free）。 */
function seedBilling(data: UsageData): void {
  if (getConfig().seeded) return;
  const pairs = new Map<string, BillingModel>();
  for (const row of data.rows) {
    if (!legacyOfficial(row.model)) continue;
    pairs.set(pairKey(row.provider, row.model), { provider: row.provider, model: row.model });
  }
  const seeded: Config = { ...getConfig(), seeded: true, billingModels: [...pairs.values()] };
  try {
    setConfig(seeded);
  } catch {
    // 写不进去（权限/只读）也不影响本次运行：内存里先按播种后的白名单算
    cfgMemo = { config: applyConfig(seeded), signature: configSignature() };
  }
}

type BillingMode = 'official' | 'recorded';

/** 白名单命中、档位认得、且不是免费模型 → 官方计费；否则 OpenCode 记账。 */
function billingModeOf(provider: string, model: string): BillingMode {
  if (isFreeModel(model) || !tierOf(model)) return 'recorded';
  const p = provider.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  if (p) return billingPairs.has(`${p}/${m}`) ? 'official' : 'recorded';
  return billingModelOnly.has(m) ? 'official' : 'recorded';
}

// ---- 法定节假日 -----------------------------------------------------------

type HolidayFile = { updatedAt?: string | number; source?: string; note?: string; years?: Record<string, string[]> };

type HolidayInfo = {
  set: Set<string>;
  counts: Record<string, number>;
  builtinYears: number[];
  cacheYears: number[];
  extra: number;
  updatedAt: number | null;
  signature: string;
};

const BUILTIN = BUILTIN_HOLIDAYS as HolidayFile;

function holidayCacheSignature(): string {
  try {
    const s = statSync(HOLIDAY_CACHE_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return 'missing';
  }
}

function readHolidayCache(): HolidayFile {
  try {
    return JSON.parse(readFileSync(HOLIDAY_CACHE_FILE, 'utf8')) as HolidayFile;
  } catch {
    return {};
  }
}

function yearKeys(file: HolidayFile | undefined): number[] {
  const years = file?.years;
  if (!years || typeof years !== 'object') return [];
  return Object.keys(years)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
}

let holidayMemo: HolidayInfo | null = null;

/** 节假日集合 = 内置清单 ∪ 本地缓存 ∪ 配置里手工追加的日期（都只含「工作日放假日」）。 */
function getHolidays(): HolidayInfo {
  const signature = `${configSignature()}|${holidayCacheSignature()}`;
  if (holidayMemo && holidayMemo.signature === signature) return holidayMemo;
  const set = new Set<string>();
  const add = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const date of list) {
      if (typeof date !== 'string' || !DATE_RE.test(date)) continue;
      set.add(date); // 内置清单与本地缓存会有重叠，用 Set 去重，天数最后再统计
    }
  };
  for (const year of yearKeys(BUILTIN)) add(BUILTIN.years?.[String(year)]);
  const cache = readHolidayCache();
  for (const year of yearKeys(cache)) add(cache.years?.[String(year)]);
  const extra = getConfig().holidays;
  add(extra);
  const counts: Record<string, number> = {};
  for (const date of set) {
    const year = date.slice(0, 4);
    counts[year] = (counts[year] ?? 0) + 1;
  }
  const cacheAt = cache.updatedAt ? new Date(cache.updatedAt).getTime() : 0;
  holidayMemo = {
    set,
    counts,
    builtinYears: yearKeys(BUILTIN),
    cacheYears: yearKeys(cache),
    extra: extra.length,
    updatedAt: Number.isFinite(cacheAt) && cacheAt > 0 ? cacheAt : null,
    signature,
  };
  return holidayMemo;
}

/** 北京日期（YYYY-MM-DD）：UTC+8 之后取日期部分。 */
const beijingDate = (date: Date): string => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * 峰时：UTC 周一至周五 01:00–04:00、06:00–10:00（北京时间 09:00–12:00、14:00–18:00）；
 * 其余时段（含周末与中国法定节假日全天）为谷时（半价）。
 * 峰时段不跨北京午夜，所以用 UTC 周几判断与官方口径等价。
 */
function isPeak(date: Date, holidays: Set<string>): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (holidays.has(beijingDate(date))) return false;
  const h = date.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

const HOLIDAY_SOURCES = [
  'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master',
  'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master',
];
const HOLIDAY_SYNC_TIMEOUT_MS = 10_000;

/** 抓某一年的工作日放假日；空占位文件（次年未公布）或网络失败返回 null。 */
async function fetchHolidayYear(year: number): Promise<string[] | null> {
  const weekend = (date: string): boolean => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  };
  for (const base of HOLIDAY_SOURCES) {
    try {
      const res = await fetch(`${base}/${year}.json`, {
        headers: { accept: 'application/json', 'user-agent': 'openchamber-session-usage' },
        signal: AbortSignal.timeout(HOLIDAY_SYNC_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { days?: Array<{ date?: unknown; isOffDay?: unknown }> };
      const dates = (Array.isArray(json.days) ? json.days : [])
        .filter((d) => d && d.isOffDay === true && typeof d.date === 'string' && DATE_RE.test(d.date) && !weekend(d.date))
        .map((d) => d.date as string)
        .sort();
      if (dates.length) return dates;
    } catch {
      // 换下一个镜像
    }
  }
  return null;
}

/** 用户主动触发：抓「内置/缓存已有的年份 + 今年 + 明年」，合并写入本地缓存。 */
async function syncHolidays(): Promise<{ synced: number[]; failed: number[] }> {
  const info = getHolidays();
  const thisYear = new Date().getUTCFullYear();
  const years = [...new Set([...info.builtinYears, ...info.cacheYears, thisYear, thisYear + 1])].sort((a, b) => a - b);
  const cache = readHolidayCache();
  const merged: Record<string, string[]> = {};
  for (const year of yearKeys(cache)) merged[String(year)] = [...(cache.years?.[String(year)] ?? [])];
  const synced: number[] = [];
  const failed: number[] = [];
  for (const year of years) {
    const dates = await fetchHolidayYear(year);
    if (dates) {
      merged[String(year)] = dates;
      synced.push(year);
    } else if (!merged[String(year)]?.length) {
      failed.push(year);
    }
  }
  const payload: HolidayFile = {
    source: 'https://github.com/NateScarlet/holiday-cn (MIT)',
    updatedAt: new Date().toISOString(),
    note: '仅收录「落在工作日的法定放假日」；周末与调休补班日由周末规则覆盖。',
    years: merged,
  };
  mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${HOLIDAY_CACHE_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(tmp, HOLIDAY_CACHE_FILE);
  holidayMemo = null;
  return { synced, failed };
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
WHERE type IN ('assistant','compaction')`;

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

/** 全量或增量（time_created >= sinceMs）读取计费行（assistant 消息 + compaction 压缩请求）。全模型，无 LIKE 过滤。 */
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
  const forkCol = schema === 'v2' ? ', fork_session_id AS forkId' : ''; // 1.x 没有 fork
  const raw = db.prepare(`SELECT id, parent_id AS parentId, title, time_created AS created${forkCol} FROM ${table}`).all() as Record<
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
      forkSessionId: typeof r.forkId === 'string' && r.forkId ? r.forkId : null,
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
    seedBilling(data); // 首次运行按旧规则播种计费白名单
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
  tier: Tier | null; // 官方计费时才是 flash/pro，其余为 null
  billing: BillingMode;
  cny: number; // DeepSeek 官方价人民币（未走官方计费时恒为 0）
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

function foldRows(rows: UsageRow[], holidays: Set<string>): Fold {
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
    const billing = billingModeOf(row.provider, row.model);
    const tier = billing === 'official' ? tierOf(row.model) : null;
    const peak = tier !== null && row.ts > 0 ? isPeak(new Date(row.ts), holidays) : false;
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
        billing,
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
      billing: m.billing, // official=官方峰谷价；recorded=OpenCode 记账
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

  // fork 会话：复制过来的历史消息 id 形如 `msg_<fork事件id>_<父会话seq>`（普通消息 id 没有下划线后缀），
  // 它们带着父会话的 token / cost，按消息聚合会把同一批用量再算一遍，所以默认只统计 fork 之后新增的部分。
  const forkSessionId = meta.forkSessionId;
  const copyIdRe = /^msg_[A-Za-z0-9]+_\d+$/;
  const copiedRows: UsageRow[] = [];

  // 主会话行 + 子代理行（归到所属的一级子会话桶）
  for (const row of data.rows) {
    if (row.sid === sessionId) {
      if (forkSessionId && copyIdRe.test(row.id)) {
        copiedRows.push(row);
        continue;
      }
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

  // 自检：复制来的消息必须都早于 fork 的创建时间。对不上说明 id 规则变了 → 退回旧口径（全量算）而不是悄悄算错。
  let forkFiltered = false;
  if (forkSessionId && copiedRows.length) {
    forkFiltered = copiedRows.every((r) => r.ts > 0 && r.ts < meta.created);
    if (!forkFiltered) {
      for (const r of copiedRows) {
        mainRows.push(r);
        treeRows.push(r);
      }
    }
  }

  const holidays = getHolidays().set;
  const foldMain = foldRows(mainRows, holidays);
  const foldTotal = foldRows(treeRows, holidays);
  const foldInherited = forkFiltered ? foldRows(copiedRows, holidays) : null;
  let lastMessageAt = 0;
  for (const r of treeRows) if (r.ts > lastMessageAt) lastMessageAt = r.ts;

  const children = directChildren
    .map((id) => {
      const cm = data.meta.get(id);
      const rows = childBuckets.get(id) ?? [];
      const fold = foldRows(rows, holidays);
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
      holidayYears: getHolidays().builtinYears,
      note: '白名单里的模型按 DeepSeek 官方峰谷价重算人民币（周末与中国法定节假日按谷价，缓存写不计费）；其余模型为 OpenCode 记账 USD；不做汇率换算。',
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
    // fork 会话：inherited = 从父会话复制过来的历史（默认不计入 main/total，单独给出便于追溯）
    fork: forkSessionId
      ? {
          isFork: true,
          parentSessionId: forkSessionId,
          filtered: forkFiltered,
          inherited: foldInherited
            ? { ...toAgg(foldInherited), byModel: modelsOf(foldInherited) }
            : null,
        }
      : null,
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

type CatalogEntry = { provider: string; model: string; requests: number; billing: BillingMode; officialPriced: boolean };

/** 库里出现过的所有 provider/model（面板下拉选项），带请求数与当前计费方式。 */
function catalogOf(data: UsageData): CatalogEntry[] {
  const map = new Map<string, CatalogEntry>();
  for (const row of data.rows) {
    const key = pairKey(row.provider, row.model);
    const found = map.get(key);
    if (found) {
      found.requests += 1;
      continue;
    }
    map.set(key, {
      provider: row.provider,
      model: row.model,
      requests: 1,
      billing: billingModeOf(row.provider, row.model),
      officialPriced: !isFreeModel(row.model) && tierOf(row.model) !== null,
    });
  }
  return [...map.values()].sort(
    (a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
  );
}

function configSnapshot() {
  let catalog: CatalogEntry[] = [];
  try {
    catalog = catalogOf(getData()); // 首次读库会顺带播种白名单，所以放在 getConfig 之前
  } catch {
    catalog = []; // 没有数据库也允许改配置
  }
  const config = getConfig();
  const holidays = getHolidays();
  return {
    ok: true as const,
    config: {
      version: 1 as const,
      seeded: config.seeded,
      billingModels: config.billingModels,
      holidays: config.holidays,
    },
    catalog,
    holidays: {
      counts: holidays.counts,
      builtinYears: holidays.builtinYears,
      cacheYears: holidays.cacheYears,
      extra: holidays.extra,
      updatedAt: holidays.updatedAt,
    },
    paths: { config: CONFIG_FILE, holidayCache: HOLIDAY_CACHE_FILE },
  };
}

/** 去重 + 清洗面板传来的白名单。 */
function sanitizeRules(value: unknown): BillingModel[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const rules: BillingModel[] = [];
  for (const item of list) {
    const rule = normalizeRule(item);
    if (!rule) continue;
    const key = pairKey(rule.provider, rule.model);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }
  return rules;
}

function readJsonBody(req: IncomingMessage, limit = 256 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'body-too-large', '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'bad-json', '请求体不是合法 JSON'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

const server = createServer(async (req, res) => {
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

    if (url.pathname === '/config') {
      if (req.method === 'GET') {
        sendJson(res, 200, configSnapshot());
        return;
      }
      if (req.method === 'PUT') {
        const parsed = await readJsonBody(req);
        const patch = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
        const next: Config = { ...getConfig(), seeded: true }; // 用户动过配置就不再自动播种
        if ('billingModels' in patch) next.billingModels = sanitizeRules(patch.billingModels);
        if ('holidays' in patch) {
          const list = Array.isArray(patch.holidays) ? patch.holidays : [];
          next.holidays = [...new Set(list.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)))].sort();
        }
        if (typeof patch.seeded === 'boolean') next.seeded = patch.seeded;
        setConfig(next);
        sendJson(res, 200, configSnapshot());
        return;
      }
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
      return;
    }

    if (url.pathname === '/holidays/sync') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
        return;
      }
      const result = await syncHolidays();
      sendJson(res, 200, { ok: true, synced: result.synced, failed: result.failed, holidays: configSnapshot().holidays });
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
