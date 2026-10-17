"use strict";

// service/main.ts
var import_node_http = require("node:http");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var import_node_sqlite = require("node:sqlite");

// service/holidays.json
var holidays_default = {
  source: "https://github.com/NateScarlet/holiday-cn (MIT)",
  updatedAt: "2026-10-17T13:42:11.540Z",
  note: "\u4EC5\u6536\u5F55\u300C\u843D\u5728\u5DE5\u4F5C\u65E5\u7684\u6CD5\u5B9A\u653E\u5047\u65E5\u300D\uFF1B\u5468\u672B\u4E0E\u8C03\u4F11\u8865\u73ED\u65E5\u7531\u5468\u672B\u89C4\u5219\u8986\u76D6\u3002",
  years: {
    "2026": [
      "2026-01-01",
      "2026-01-02",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-02-23",
      "2026-04-06",
      "2026-05-01",
      "2026-05-04",
      "2026-05-05",
      "2026-06-19",
      "2026-09-25",
      "2026-10-01",
      "2026-10-02",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07"
    ]
  }
};

// service/main.ts
var PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT || 0);
var TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN || "";
var TTL_MS = 15e3;
var IDLE_RELEASE_MS = 10 * 6e4;
var OVERLAP_MS = 10 * 6e4;
var TREND_MAX_POINTS = 1500;
var SESSION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
var HttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  return 0;
};
var emptyTokens = () => ({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 });
var tokenTotal = (t) => t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
var addTokens = (into, add) => {
  into.input += add.input;
  into.output += add.output;
  into.reasoning += add.reasoning;
  into.cacheRead += add.cacheRead;
  into.cacheWrite += add.cacheWrite;
};
var hitRate = (t) => {
  const denom = t.input + t.cacheRead + t.cacheWrite;
  return denom > 0 ? t.cacheRead / denom : null;
};
var PRICING = {
  flash: { hitOff: 0.02, hitPeak: 0.04, missOff: 1, missPeak: 2, outOff: 4, outPeak: 8 },
  pro: { hitOff: 0.15, hitPeak: 0.3, missOff: 4.5, missPeak: 9, outOff: 13.5, outPeak: 27 }
};
var PEAK_WINDOW_UTC = "\u5468\u4E00\u81F3\u5468\u4E94 01:00\u201304:00\u300106:00\u201310:00 UTC";
var PEAK_WINDOW_LOCAL = "\u5317\u4EAC\u65F6\u95F4 09:00\u201312:00\u300114:00\u201318:00\uFF08\u5468\u672B\u4E0E\u4E2D\u56FD\u6CD5\u5B9A\u8282\u5047\u65E5\u5168\u5929\u4E3A\u8C37\u4EF7\uFF09";
var PEAK_WINDOWS_MIN = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60]
];
function tierOf(model) {
  const m = model.toLowerCase();
  if (!m.startsWith("deepseek")) return null;
  return m.includes("pro") ? "pro" : "flash";
}
var isFreeModel = (model) => model.toLowerCase().includes("free");
var legacyOfficial = (model) => {
  const m = model.trim().toLowerCase();
  return m.startsWith("deepseek") && !m.includes("free");
};
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var CONFIG_DIR = (0, import_node_path.join)(process.env.XDG_CONFIG_HOME || (0, import_node_path.join)((0, import_node_os.homedir)(), ".config"), "openchamber");
var CONFIG_FILE = process.env.SESSION_USAGE_CONFIG || (0, import_node_path.join)(CONFIG_DIR, "session-usage.json");
var HOLIDAY_CACHE_FILE = (0, import_node_path.join)(CONFIG_DIR, "session-usage-holidays.json");
var emptyConfig = () => ({ version: 1, seeded: false, billingModels: [], holidays: [] });
var pairKey = (provider, model) => `${provider.trim().toLowerCase()}/${model.trim().toLowerCase()}`;
function normalizeRule(value) {
  if (!value || typeof value !== "object") return null;
  const raw = value;
  const provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!model || model.length > 200 || provider.length > 200) return null;
  return { provider, model };
}
function readConfigFile() {
  let raw;
  try {
    raw = JSON.parse((0, import_node_fs.readFileSync)(CONFIG_FILE, "utf8"));
  } catch {
    return emptyConfig();
  }
  const rules = Array.isArray(raw.billingModels) ? raw.billingModels : [];
  const holidays = Array.isArray(raw.holidays) ? raw.holidays.filter((d) => typeof d === "string" && DATE_RE.test(d)) : [];
  return {
    version: 1,
    seeded: raw.seeded === true,
    billingModels: rules.map(normalizeRule).filter((r) => r !== null),
    holidays
  };
}
function configSignature() {
  try {
    const s = (0, import_node_fs.statSync)(CONFIG_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "missing";
  }
}
var cfgMemo = null;
var billingPairs = /* @__PURE__ */ new Set();
var billingModelOnly = /* @__PURE__ */ new Set();
function applyConfig(config) {
  const pairs = /* @__PURE__ */ new Set();
  const models = /* @__PURE__ */ new Set();
  for (const rule of config.billingModels) {
    if (isFreeModel(rule.model) || !tierOf(rule.model)) continue;
    models.add(rule.model.trim().toLowerCase());
    pairs.add(pairKey(rule.provider, rule.model));
  }
  billingPairs = pairs;
  billingModelOnly = models;
  return config;
}
function getConfig() {
  const signature = configSignature();
  if (cfgMemo && cfgMemo.signature === signature) return cfgMemo.config;
  const config = applyConfig(readConfigFile());
  cfgMemo = { config, signature };
  return config;
}
function setConfig(config) {
  (0, import_node_fs.mkdirSync)(CONFIG_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  (0, import_node_fs.writeFileSync)(tmp, `${JSON.stringify(config, null, 2)}
`, "utf8");
  (0, import_node_fs.renameSync)(tmp, CONFIG_FILE);
  const applied = applyConfig(config);
  cfgMemo = { config: applied, signature: configSignature() };
}
function seedBilling(data) {
  if (getConfig().seeded) return;
  const pairs = /* @__PURE__ */ new Map();
  for (const row of data.rows) {
    if (!legacyOfficial(row.model)) continue;
    pairs.set(pairKey(row.provider, row.model), { provider: row.provider, model: row.model });
  }
  const seeded = { ...getConfig(), seeded: true, billingModels: [...pairs.values()] };
  try {
    setConfig(seeded);
  } catch {
    cfgMemo = { config: applyConfig(seeded), signature: configSignature() };
  }
}
function billingModeOf(provider, model) {
  if (isFreeModel(model) || !tierOf(model)) return "recorded";
  const p = provider.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  if (p) return billingPairs.has(`${p}/${m}`) ? "official" : "recorded";
  return billingModelOnly.has(m) ? "official" : "recorded";
}
var BUILTIN = holidays_default;
function holidayCacheSignature() {
  try {
    const s = (0, import_node_fs.statSync)(HOLIDAY_CACHE_FILE);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "missing";
  }
}
function readHolidayCache() {
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(HOLIDAY_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function yearKeys(file) {
  const years = file?.years;
  if (!years || typeof years !== "object") return [];
  return Object.keys(years).map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
}
var holidayMemo = null;
function getHolidays() {
  const signature = `${configSignature()}|${holidayCacheSignature()}`;
  if (holidayMemo && holidayMemo.signature === signature) return holidayMemo;
  const set = /* @__PURE__ */ new Set();
  const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const date of list) {
      if (typeof date !== "string" || !DATE_RE.test(date)) continue;
      set.add(date);
    }
  };
  for (const year of yearKeys(BUILTIN)) add(BUILTIN.years?.[String(year)]);
  const cache = readHolidayCache();
  for (const year of yearKeys(cache)) add(cache.years?.[String(year)]);
  const extra = getConfig().holidays;
  add(extra);
  const counts = {};
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
    signature
  };
  return holidayMemo;
}
var beijingDate = (date) => new Date(date.getTime() + 8 * 36e5).toISOString().slice(0, 10);
function isPeak(date, holidays) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (holidays.has(beijingDate(date))) return false;
  const h = date.getUTCHours();
  return h >= 1 && h < 4 || h >= 6 && h < 10;
}
function windowPayload() {
  return { peakWindows: PEAK_WINDOWS_MIN, holidays: [...getHolidays().set].sort() };
}
var HOLIDAY_SOURCES = [
  "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master",
  "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master"
];
var HOLIDAY_SYNC_TIMEOUT_MS = 1e4;
async function fetchHolidayYear(year) {
  const weekend = (date) => {
    const day = (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).getUTCDay();
    return day === 0 || day === 6;
  };
  for (const base of HOLIDAY_SOURCES) {
    try {
      const res = await fetch(`${base}/${year}.json`, {
        headers: { accept: "application/json", "user-agent": "openchamber-session-usage" },
        signal: AbortSignal.timeout(HOLIDAY_SYNC_TIMEOUT_MS)
      });
      if (!res.ok) continue;
      const json = await res.json();
      const dates = (Array.isArray(json.days) ? json.days : []).filter((d) => d && d.isOffDay === true && typeof d.date === "string" && DATE_RE.test(d.date) && !weekend(d.date)).map((d) => d.date).sort();
      if (dates.length) return dates;
    } catch {
    }
  }
  return null;
}
async function syncHolidays() {
  const info = getHolidays();
  const thisYear = (/* @__PURE__ */ new Date()).getUTCFullYear();
  const years = [.../* @__PURE__ */ new Set([...info.builtinYears, ...info.cacheYears, thisYear, thisYear + 1])].sort((a, b) => a - b);
  const cache = readHolidayCache();
  const merged = {};
  for (const year of yearKeys(cache)) merged[String(year)] = [...cache.years?.[String(year)] ?? []];
  const synced = [];
  const failed = [];
  for (const year of years) {
    const dates = await fetchHolidayYear(year);
    if (dates) {
      merged[String(year)] = dates;
      synced.push(year);
    } else if (!merged[String(year)]?.length) {
      failed.push(year);
    }
  }
  const payload = {
    source: "https://github.com/NateScarlet/holiday-cn (MIT)",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    note: "\u4EC5\u6536\u5F55\u300C\u843D\u5728\u5DE5\u4F5C\u65E5\u7684\u6CD5\u5B9A\u653E\u5047\u65E5\u300D\uFF1B\u5468\u672B\u4E0E\u8C03\u4F11\u8865\u73ED\u65E5\u7531\u5468\u672B\u89C4\u5219\u8986\u76D6\u3002",
    years: merged
  };
  (0, import_node_fs.mkdirSync)(CONFIG_DIR, { recursive: true });
  const tmp = `${HOLIDAY_CACHE_FILE}.tmp`;
  (0, import_node_fs.writeFileSync)(tmp, `${JSON.stringify(payload, null, 2)}
`, "utf8");
  (0, import_node_fs.renameSync)(tmp, HOLIDAY_CACHE_FILE);
  holidayMemo = null;
  return { synced, failed };
}
function messageOfficialCost(tokens, tier, peak) {
  if (!tier) return 0;
  const p = PRICING[tier];
  const hit = peak ? p.hitPeak : p.hitOff;
  const miss = peak ? p.missPeak : p.missOff;
  const out = peak ? p.outPeak : p.outOff;
  return (tokens.input * miss + tokens.cacheRead * hit + (tokens.output + tokens.reasoning) * out) / 1e6;
}
function findDb() {
  const fromEnv = process.env.OPENCODE_DB;
  if (fromEnv) return (0, import_node_fs.existsSync)(fromEnv) ? fromEnv : null;
  const def = (0, import_node_path.join)((0, import_node_os.homedir)(), ".local", "share", "opencode", "opencode.db");
  return (0, import_node_fs.existsSync)(def) ? def : null;
}
function openDb(dbPath) {
  return new import_node_sqlite.DatabaseSync(dbPath, { readOnly: true });
}
function tableExists(db, name) {
  const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  return !!row;
}
function tableCount(db, name) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get();
  return num(row?.n);
}
function detectSchema(db) {
  const hasV2 = tableExists(db, "session_v2") && tableExists(db, "session_message");
  if (hasV2 && tableCount(db, "session_message") > 0) return "v2";
  const hasV1 = tableExists(db, "session") && tableExists(db, "message");
  if (hasV1 && tableCount(db, "message") > 0) return "v1";
  return hasV2 ? "v2" : null;
}
var ROW_SELECT_V2 = `
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
var ROW_SELECT_V1 = `
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
function rowToUsage(raw) {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  if (!id) return null;
  const model = typeof raw.model === "string" && raw.model ? raw.model : "unknown";
  const provider = typeof raw.provider === "string" ? raw.provider : "";
  return {
    id,
    sid: typeof raw.sid === "string" ? raw.sid : "",
    ts: num(raw.ts),
    model,
    provider,
    tokens: {
      input: num(raw.input),
      output: num(raw.output),
      reasoning: num(raw.reasoning),
      cacheRead: num(raw.cache_read),
      cacheWrite: num(raw.cache_write)
    },
    cost: num(raw.cost)
  };
}
function loadRows(db, schema, sinceMs) {
  const base = schema === "v2" ? ROW_SELECT_V2 : ROW_SELECT_V1;
  const sql = typeof sinceMs === "number" ? `${base} AND time_created >= ?` : base;
  const stmt = db.prepare(sql);
  const raw = typeof sinceMs === "number" ? stmt.all(sinceMs) : stmt.all();
  const rows = [];
  for (const r of raw) {
    const row = rowToUsage(r);
    if (row && row.sid) rows.push(row);
  }
  return rows;
}
function loadMeta(db, schema) {
  const table = schema === "v2" ? "session_v2" : "session";
  const forkCol = schema === "v2" ? ", fork_session_id AS forkId" : "";
  const raw = db.prepare(`SELECT id, parent_id AS parentId, title, time_created AS created${forkCol} FROM ${table}`).all();
  const meta = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  for (const r of raw) {
    const id = typeof r.id === "string" ? r.id : null;
    if (!id) continue;
    const parentId = typeof r.parentId === "string" && r.parentId ? r.parentId : null;
    meta.set(id, {
      parentId,
      title: typeof r.title === "string" && r.title ? r.title : "",
      created: num(r.created),
      forkSessionId: typeof r.forkId === "string" && r.forkId ? r.forkId : null
    });
    if (parentId) {
      const list = children.get(parentId);
      if (list) list.push(id);
      else children.set(parentId, [id]);
    }
  }
  return { meta, children };
}
function loadFull(dbPath) {
  const db = openDb(dbPath);
  try {
    const schema = detectSchema(db);
    if (!schema) throw new HttpError(503, "db-empty", "\u6570\u636E\u5E93\u4E2D\u6CA1\u6709 OpenCode \u4F1A\u8BDD\u8868");
    const rows = loadRows(db, schema);
    const { meta, children } = loadMeta(db, schema);
    const index = /* @__PURE__ */ new Map();
    rows.forEach((r, i) => index.set(r.id, i));
    return { schema, dbPath, rows, index, meta, children };
  } finally {
    db.close();
  }
}
function refreshIncremental(prev) {
  const db = openDb(prev.dbPath);
  try {
    const schema = detectSchema(db);
    if (schema !== prev.schema) return null;
    let lastTs = 0;
    for (const r of prev.rows) if (r.ts > lastTs) lastTs = r.ts;
    const since = Math.max(0, lastTs - OVERLAP_MS);
    for (const row of loadRows(db, schema, since)) {
      const at = prev.index.get(row.id);
      if (at === void 0) {
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
var cached = null;
function getData() {
  const dbPath = findDb();
  if (!dbPath) {
    const hinted = process.env.OPENCODE_DB || "~/.local/share/opencode/opencode.db";
    throw new HttpError(503, "db-missing", `\u627E\u4E0D\u5230 opencode.db\uFF08${hinted}\uFF09`);
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
    }
  }
  try {
    const data = loadFull(dbPath);
    seedBilling(data);
    cached = { data, at: now, usedAt: now, dbPath };
    return data;
  } catch (err) {
    if (cached && cached.dbPath === dbPath) {
      cached.at = now - TTL_MS + 3e3;
      cached.usedAt = now;
      return cached.data;
    }
    throw err;
  }
}
var idleTimer = setInterval(() => {
  if (cached && Date.now() - cached.usedAt > IDLE_RELEASE_MS) cached = null;
}, 6e4);
idleTimer.unref();
function foldRows(rows, holidays) {
  const fold = {
    requests: 0,
    tokens: emptyTokens(),
    cost: 0,
    cny: 0,
    peakCny: 0,
    offCny: 0,
    usdOther: 0,
    hasDeepseek: false,
    hasOther: false,
    models: /* @__PURE__ */ new Map()
  };
  for (const row of rows) {
    const billing = billingModeOf(row.provider, row.model);
    const tier = billing === "official" ? tierOf(row.model) : null;
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
        offCny: 0
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
function toAgg(fold) {
  return {
    requests: fold.requests,
    tokens: { ...fold.tokens, total: tokenTotal(fold.tokens) },
    cost: fold.cost,
    // OpenCode 记账 USD（全部消息）
    costCny: fold.cny,
    // DeepSeek 官方峰谷价人民币合计
    costCnyPeak: fold.peakCny,
    costCnyOff: fold.offCny,
    costUsdOther: fold.usdOther,
    // 非 DeepSeek 的 OpenCode 记账 USD
    hasDeepseek: fold.hasDeepseek,
    hasOther: fold.hasOther,
    hitRate: hitRate(fold.tokens)
  };
}
function modelsOf(fold) {
  return [...fold.models.values()].map((m) => ({
    model: m.model,
    provider: m.provider,
    requests: m.requests,
    tokens: { ...m.tokens, total: tokenTotal(m.tokens) },
    cost: m.cost,
    // 原字段：OpenCode 记账 USD
    billing: m.billing,
    // official=官方峰谷价；recorded=OpenCode 记账
    currency: m.tier ? "CNY" : "USD",
    // 该行展示币种
    amount: m.tier ? m.cny : m.cost,
    // 该行展示金额（自身币种）
    official: m.tier ? { cny: m.cny, peakCny: m.peakCny, offCny: m.offCny } : null
  })).sort((a, b) => b.amount - a.amount || b.tokens.total - a.tokens.total || a.model.localeCompare(b.model));
}
function buildTrend(rows) {
  const sorted = rows.slice().sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  const all = sorted.map((r) => [r.ts, r.tokens.input + r.tokens.cacheRead]);
  if (all.length <= TREND_MAX_POINTS) return { points: all, downsampled: false };
  const step = Math.ceil(all.length / TREND_MAX_POINTS);
  const sampled = [];
  for (let i = 0; i < all.length; i += step) sampled.push(all[i]);
  const last = all[all.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return { points: sampled, downsampled: true };
}
function buildSessionReport(data, sessionId) {
  const meta = data.meta.get(sessionId);
  if (!meta) return null;
  const directChildren = data.children.get(sessionId) ?? [];
  const descendants = /* @__PURE__ */ new Set();
  const stack = [...directChildren];
  while (stack.length) {
    const id = stack.pop();
    if (descendants.has(id)) continue;
    descendants.add(id);
    for (const c of data.children.get(id) ?? []) stack.push(c);
  }
  const mainRows = [];
  const treeRows = [];
  const childBuckets = /* @__PURE__ */ new Map();
  for (const id of directChildren) childBuckets.set(id, []);
  const forkSessionId = meta.forkSessionId;
  const copyIdRe = /^msg_[A-Za-z0-9]+_\d+$/;
  const copiedRows = [];
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
  const children = directChildren.map((id) => {
    const cm = data.meta.get(id);
    const rows = childBuckets.get(id) ?? [];
    const fold = foldRows(rows, holidays);
    let lastChildTs = 0;
    for (const r of rows) if (r.ts > lastChildTs) lastChildTs = r.ts;
    return {
      id,
      title: cm?.title ?? "",
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
      descendants: descendantCount(data, id) - 1
    };
  }).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const mainTrend = buildTrend(mainRows);
  const totalTrend = buildTrend(treeRows);
  return {
    ok: true,
    generatedAt: Date.now(),
    db: { path: data.dbPath, schema: data.schema },
    pricing: {
      peakWindowUtc: PEAK_WINDOW_UTC,
      peakWindowLocal: PEAK_WINDOW_LOCAL,
      cnyPerMillion: PRICING,
      holidayYears: getHolidays().builtinYears,
      window: windowPayload(),
      note: "\u767D\u540D\u5355\u91CC\u7684\u6A21\u578B\u6309 DeepSeek \u5B98\u65B9\u5CF0\u8C37\u4EF7\u91CD\u7B97\u4EBA\u6C11\u5E01\uFF08\u5468\u672B\u4E0E\u4E2D\u56FD\u6CD5\u5B9A\u8282\u5047\u65E5\u6309\u8C37\u4EF7\uFF0C\u7F13\u5B58\u5199\u4E0D\u8BA1\u8D39\uFF09\uFF1B\u5176\u4F59\u6A21\u578B\u4E3A OpenCode \u8BB0\u8D26 USD\uFF1B\u4E0D\u505A\u6C47\u7387\u6362\u7B97\u3002"
    },
    session: {
      id: sessionId,
      title: meta.title,
      parentId: meta.parentId,
      startedAt: meta.created,
      lastMessageAt,
      childCount: directChildren.length,
      descendantCount: descendants.size
    },
    // fork 会话：inherited = 从父会话复制过来的历史（默认不计入 main/total，单独给出便于追溯）
    fork: forkSessionId ? {
      isFork: true,
      parentSessionId: forkSessionId,
      filtered: forkFiltered,
      inherited: foldInherited ? { ...toAgg(foldInherited), byModel: modelsOf(foldInherited) } : null
    } : null,
    main: { ...toAgg(foldMain), byModel: modelsOf(foldMain), trend: mainTrend },
    total: { ...toAgg(foldTotal), byModel: modelsOf(foldTotal), trend: totalTrend },
    children
  };
}
function descendantCount(data, rootId) {
  const seen = /* @__PURE__ */ new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    for (const c of data.children.get(id) ?? []) {
      if (!seen.has(c)) {
        seen.add(c);
        stack.push(c);
      }
    }
  }
  return seen.size;
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function catalogOf(data) {
  const map = /* @__PURE__ */ new Map();
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
      officialPriced: !isFreeModel(row.model) && tierOf(row.model) !== null
    });
  }
  return [...map.values()].sort(
    (a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
  );
}
function configSnapshot() {
  let catalog = [];
  try {
    catalog = catalogOf(getData());
  } catch {
    catalog = [];
  }
  const config = getConfig();
  const holidays = getHolidays();
  return {
    ok: true,
    config: {
      version: 1,
      seeded: config.seeded,
      billingModels: config.billingModels,
      holidays: config.holidays
    },
    catalog,
    holidays: {
      counts: holidays.counts,
      builtinYears: holidays.builtinYears,
      cacheYears: holidays.cacheYears,
      extra: holidays.extra,
      updatedAt: holidays.updatedAt
    },
    paths: { config: CONFIG_FILE, holidayCache: HOLIDAY_CACHE_FILE },
    window: windowPayload()
  };
}
function sanitizeRules(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = /* @__PURE__ */ new Set();
  const rules = [];
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
function readJsonBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "body-too-large", "\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "bad-json", "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}
var server = (0, import_node_http.createServer)(async (req, res) => {
  try {
    if (TOKEN) {
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${TOKEN}`) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    if (url.pathname === "/session") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "method-not-allowed" });
        return;
      }
      const sessionId = url.searchParams.get("sessionId") ?? "";
      if (!SESSION_ID_RE.test(sessionId)) {
        sendJson(res, 400, { ok: false, error: "bad-request", message: "sessionId \u65E0\u6548" });
        return;
      }
      const data = getData();
      const report = buildSessionReport(data, sessionId);
      if (!report) {
        sendJson(res, 404, { ok: false, error: "session-not-found", message: "\u6570\u636E\u5E93\u4E2D\u8FD8\u6CA1\u6709\u8FD9\u4E2A\u4F1A\u8BDD" });
        return;
      }
      sendJson(res, 200, report);
      return;
    }
    if (url.pathname === "/config") {
      if (req.method === "GET") {
        sendJson(res, 200, configSnapshot());
        return;
      }
      if (req.method === "PUT") {
        const parsed = await readJsonBody(req);
        const patch = parsed && typeof parsed === "object" ? parsed : {};
        const next = { ...getConfig(), seeded: true };
        if ("billingModels" in patch) next.billingModels = sanitizeRules(patch.billingModels);
        if ("holidays" in patch) {
          const list = Array.isArray(patch.holidays) ? patch.holidays : [];
          next.holidays = [...new Set(list.filter((d) => typeof d === "string" && DATE_RE.test(d)))].sort();
        }
        if (typeof patch.seeded === "boolean") next.seeded = patch.seeded;
        setConfig(next);
        sendJson(res, 200, configSnapshot());
        return;
      }
      sendJson(res, 405, { ok: false, error: "method-not-allowed" });
      return;
    }
    if (url.pathname === "/holidays/sync") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "method-not-allowed" });
        return;
      }
      const result = await syncHolidays();
      sendJson(res, 200, { ok: true, synced: result.synced, failed: result.failed, holidays: configSnapshot().holidays });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not-found" });
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { ok: false, error: err.code, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { ok: false, error: "internal", message });
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[session-usage] service listening on 127.0.0.1:${PORT}`);
});
