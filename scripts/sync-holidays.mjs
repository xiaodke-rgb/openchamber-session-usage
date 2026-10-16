/**
 * 抓取中国法定节假日，写成 service/holidays.json（构建期内嵌，运行期不联网）。
 *
 * 数据源：NateScarlet/holiday-cn（MIT），每年一个 JSON：
 *   { year, papers: [...], days: [{ name, date, isOffDay }] }
 *   isOffDay=true 放假日；false 调休补班（周末上班）。
 *
 * 只保留「落在工作日的放假日」：周末本来就算谷价，调休补班日本来就在周末集合里，
 * 所以判断谷价时只需要「周末 || 在清单里」。
 *
 * 抓不到的年份保留文件里已有的数据（次年安排一般要到上一年 11 月才公布，
 * 那时 holiday-cn 的年份文件还是空的）。
 *
 * 用法：node scripts/sync-holidays.mjs [年份...]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TARGET = fileURLToPath(new URL('../service/holidays.json', import.meta.url));
const SOURCES = [
  'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master',
  'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master',
];
const TIMEOUT_MS = 10_000;
const HEADERS = { accept: 'application/json', 'user-agent': 'openchamber-session-usage' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isWeekend = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(TARGET, 'utf8'));
    return parsed && typeof parsed === 'object' && typeof parsed.years === 'object' && parsed.years ? parsed : null;
  } catch {
    return null;
  }
}

/** 抓某一年；返回「工作日放假日」日期数组，抓不到/还是空占位则 null。 */
async function fetchYear(year) {
  for (const base of SOURCES) {
    try {
      const res = await fetch(`${base}/${year}.json`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const json = await res.json();
      const days = Array.isArray(json?.days) ? json.days : [];
      const dates = days
        .filter((d) => d && d.isOffDay === true && typeof d.date === 'string' && DATE_RE.test(d.date) && !isWeekend(d.date))
        .map((d) => d.date)
        .sort();
      if (dates.length) return dates;
    } catch {
      // 网络失败 → 换下一个镜像
    }
  }
  return null;
}

export async function syncHolidays(extraYears = []) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const existing = await readExisting();
  const years = new Set([
    thisYear,
    thisYear + 1,
    ...extraYears,
    ...Object.keys(existing?.years ?? {}).map(Number),
  ]);
  const sorted = [...years].filter((y) => Number.isFinite(y)).sort();

  const merged = {};
  const skipped = [];
  const fetched = [];
  for (const year of sorted) {
    const dates = await fetchYear(year);
    if (dates && dates.length) {
      merged[year] = dates;
      fetched.push(year);
    } else {
      const kept = existing?.years?.[year];
      if (Array.isArray(kept) && kept.length) {
        merged[year] = kept;
        skipped.push(year);
      }
    }
  }

  const payload = {
    source: 'https://github.com/NateScarlet/holiday-cn (MIT)',
    updatedAt: now.toISOString(),
    note: '仅收录「落在工作日的法定放假日」；周末与调休补班日由周末规则覆盖。',
    years: merged,
  };
  await writeFile(TARGET, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { fetched, skipped, years: Object.keys(merged).map(Number).sort() };
}

const invokedDirectly = process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`)) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const cliYears = process.argv.slice(2).map(Number).filter((y) => Number.isFinite(y));
  const result = await syncHolidays(cliYears);
  const summary = Object.entries((await readExisting())?.years ?? {})
    .map(([y, list]) => `${y}:${list.length}`)
    .join(' ');
  console.log(`[holidays] 抓取成功 ${result.fetched.join(',') || '无'}；沿用旧数据 ${result.skipped.join(',') || '无'}；清单 ${summary}`);
}
