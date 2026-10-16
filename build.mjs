import { build } from 'esbuild';
import { syncHolidays } from './scripts/sync-holidays.mjs';

// 节假日数据构建期抓一次并内嵌（运行期不联网）；失败就沿用仓库里已有的 service/holidays.json
try {
  const { fetched, skipped, years } = await syncHolidays();
  console.log(`holidays: fetched ${fetched.join(',') || '-'} · kept ${skipped.join(',') || '-'} · years ${years.join(',') || '-'}`);
} catch (err) {
  console.warn('holidays: sync skipped —', err instanceof Error ? err.message : err);
}

const shared = { bundle: true, logLevel: 'info', minify: false, sourcemap: false };
const browser = { ...shared, platform: 'browser', format: 'iife', target: 'chrome120' };

await build({ ...browser, entryPoints: ['panel/main.ts'], outfile: 'panel/main.js' });
await build({ ...browser, entryPoints: ['status/main.ts'], outfile: 'status/main.js' });
await build({ ...shared, platform: 'node', format: 'cjs', target: 'node22', entryPoints: ['service/main.ts'], outfile: 'service/main.js' });

console.log('build ok: panel/main.js, status/main.js, service/main.js');
