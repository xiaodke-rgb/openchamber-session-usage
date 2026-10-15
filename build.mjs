import { build } from 'esbuild';

const shared = { bundle: true, logLevel: 'info', minify: false, sourcemap: false };
const browser = { ...shared, platform: 'browser', format: 'iife', target: 'chrome120' };

await build({ ...browser, entryPoints: ['panel/main.ts'], outfile: 'panel/main.js' });
await build({ ...browser, entryPoints: ['status/main.ts'], outfile: 'status/main.js' });
await build({ ...shared, platform: 'node', format: 'cjs', target: 'node22', entryPoints: ['service/main.ts'], outfile: 'service/main.js' });

console.log('build ok: panel/main.js, status/main.js, service/main.js');
