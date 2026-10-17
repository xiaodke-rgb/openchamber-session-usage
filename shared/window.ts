/**
 * DeepSeek 峰谷时段（北京时间）判定与倒计时文案，panel / status 共用。
 *
 * 口径与 service/main.ts 的计费一致：
 * - 高峰：工作日（周一至周五）北京时间 09:00–12:00、14:00–18:00
 * - 其余时间、周末、中国法定节假日：谷价
 * 节假日清单由 service 下发（内置清单 ∪ 本地缓存 ∪ 用户手工追加）。
 */

export type PeakWindow = [number, number]; // 北京时间当天分钟数，[起, 止)

export type WindowData = {
  /** 高峰区间，例如 [[540, 720], [840, 1080]] */
  peakWindows: PeakWindow[];
  /** 法定节假日日期 YYYY-MM-DD */
  holidays: string[];
};

export type Phase = 'holiday' | 'weekend' | 'peak' | 'offpeak';
export type Lang = 'zh' | 'en';

const DAY_MS = 86_400_000;
const CN_OFFSET = 8 * 60 * 60 * 1000;

/** 北京时间的日期、星期（0=周日）与当天毫秒数。 */
export function beijingParts(ts: number): { date: string; weekday: number; msOfDay: number } {
  const d = new Date(ts + CN_OFFSET);
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    msOfDay: d.getUTCHours() * 3_600_000 + d.getUTCMinutes() * 60_000 + d.getUTCSeconds() * 1000,
  };
}

/** 北京时间 HH:mm。 */
export function beijingClock(ts: number): string {
  const d = new Date(ts + CN_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const inPeak = (msOfDay: number, windows: PeakWindow[]): boolean =>
  windows.some(([from, to]) => msOfDay >= from * 60_000 && msOfDay < to * 60_000);

/** 某一时刻所处的时段（法定节假日 > 周末 > 高峰 > 谷价）。 */
export function phaseAt(ts: number, data: WindowData, holidaySet?: Set<string>): Phase {
  const { date, weekday, msOfDay } = beijingParts(ts);
  const holidays = holidaySet ?? new Set(data.holidays);
  if (holidays.has(date)) return 'holiday';
  if (weekday === 0 || weekday === 6) return 'weekend';
  return inPeak(msOfDay, data.peakWindows) ? 'peak' : 'offpeak';
}

/** 下一个时段切换点（峰 ↔ 谷），最多向后看 14 天。周末/节假日与普通谷价同属「谷」，不互为切换点。 */
export function nextSwitch(ts: number, data: WindowData, holidaySet?: Set<string>): { phase: Phase; until: number } {
  const holidays = holidaySet ?? new Set(data.holidays);
  const now = phaseAt(ts, data, holidays);
  const peakNow = now === 'peak';
  const dayStart = Math.floor((ts + CN_OFFSET) / DAY_MS) * DAY_MS - CN_OFFSET;
  const offsets = new Set<number>([0]);
  for (const [from, to] of data.peakWindows) {
    offsets.add(from * 60_000);
    offsets.add(to * 60_000);
  }
  const candidates: number[] = [];
  for (let d = 0; d < 15; d++) for (const off of offsets) candidates.push(dayStart + d * DAY_MS + off);
  candidates.sort((a, b) => a - b);
  for (const at of candidates) {
    if (at <= ts) continue;
    const phase = phaseAt(at, data, holidays);
    if (phase === 'peak' !== peakNow) return { phase, until: at };
  }
  return { phase: peakNow ? 'offpeak' : 'peak', until: ts + 60 * 60_000 };
}

/** 倒计时：向上取整到分钟，最少「1 分钟」。 */
export function countdownText(until: number, now: number, lang: Lang): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (lang === 'zh') {
    if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
    return `${m} 分钟`;
  }
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** 时段完整名称（胶囊条文案主体）。 */
export function phaseLabel(phase: Phase, lang: Lang): string {
  const zh: Record<Phase, string> = {
    holiday: '法定假日——全谷价',
    weekend: '周末时段——全谷价',
    peak: '峰时',
    offpeak: '平价',
  };
  const en: Record<Phase, string> = {
    holiday: 'Public holiday — all off-peak',
    weekend: 'Weekend — all off-peak',
    peak: 'Peak',
    offpeak: 'Off-peak',
  };
  return (lang === 'zh' ? zh : en)[phase];
}

/** 时段短名称（窄栏用）。 */
export function phaseShort(phase: Phase, lang: Lang): string {
  const zh: Record<Phase, string> = { holiday: '假日全谷', weekend: '周末全谷', peak: '峰时', offpeak: '平价' };
  const en: Record<Phase, string> = { holiday: 'Holiday', weekend: 'Weekend', peak: 'Peak', offpeak: 'Off-peak' };
  return (lang === 'zh' ? zh : en)[phase];
}

export function nextLabel(phase: Phase, lang: Lang): string {
  if (lang === 'zh') return phase === 'peak' ? '后进入高峰' : '后进入平价';
  return phase === 'peak' ? ' to peak' : ' to off-peak';
}
/** 指针档位：峰 25%、周末/节假日 50%、谷 75%（保留给需要离散刻度的场景）。 */
export function markerPct(phase: Phase): number {
  if (phase === 'peak') return 25;
  return phase === 'offpeak' ? 75 : 50;
}

/** 当天已过时间的百分比（北京时间 00:00→0%，24:00→100%），指针按这个走。 */
export function dayProgress(ts: number): number {
  return (beijingParts(ts).msOfDay / DAY_MS) * 100;
}

/** 当前谷价区块内的进度百分比：周末是整段两天、节假日是整个假期（含相邻周末），指针按整段走。 */
export function blockProgress(ts: number, data: WindowData): number {
  const { start, end } = offBlock(ts, data);
  const span = end - start;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((ts - start) / span) * 100));
}

/** 当前谷价区块的起点与终点（北京时间整天，可跨多天）。 */
export function offBlock(ts: number, data: WindowData): { start: number; end: number } {
  const holidays = new Set(data.holidays);
  const dayIndex = Math.floor((ts + CN_OFFSET) / DAY_MS);
  const isOff = (idx: number): boolean => {
    const d = new Date(idx * DAY_MS);
    const wd = d.getUTCDay();
    return wd === 0 || wd === 6 || holidays.has(d.toISOString().slice(0, 10));
  };
  let s = dayIndex;
  let e = dayIndex;
  while (isOff(s - 1)) s -= 1;
  while (isOff(e + 1)) e += 1;
  return { start: s * DAY_MS - CN_OFFSET, end: (e + 1) * DAY_MS - CN_OFFSET };
}

/** 当前谷价区块的小时数（tooltip 用）。 */
export function blockHours(ts: number, data: WindowData): number {
  const { start, end } = offBlock(ts, data);
  return Math.round((end - start) / 3_600_000);
}

/** 一天 24 小时的轨道分段：峰段为 true。周末/节假日整天没有峰段，返回单段谷色。 */
export function daySegments(phase: Phase, windows: PeakWindow[]): Array<{ from: number; to: number; peak: boolean }> {
  if (phase === 'weekend' || phase === 'holiday') return [{ from: 0, to: 1440, peak: false }];
  const out: Array<{ from: number; to: number; peak: boolean }> = [];
  let cursor = 0;
  for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
    if (from > cursor) out.push({ from: cursor, to: from, peak: false });
    out.push({ from, to, peak: true });
    cursor = to;
  }
  if (cursor < 1440) out.push({ from: cursor, to: 1440, peak: false });
  return out;
}

/** 一行完整文案：「周末时段——全谷价 · 35 小时 44 分后进入高峰」。 */
export function stripText(now: number, data: WindowData, lang: Lang, short = false): string {
  const phase = phaseAt(now, data);
  const next = nextSwitch(now, data);
  const chip = short ? phaseShort(phase, lang) : phaseLabel(phase, lang);
  return `${chip} · ${countdownText(next.until, now, lang)}${nextLabel(next.phase, lang)}`;
}
