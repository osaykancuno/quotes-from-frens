// Writes deploy/quotes-from-frens.config.json from the JSON that `rare-profile app deploy … --json` printed (the one-time
// bootstrap of QUOTES FROM FRENS), so nobody copies an app ID or an address by hand. Public identity and routing only:
// the arcade's shared credit group, the app's ID and its exact HTTPS origin. Then it prints the update command.
// Usage: node --import tsx scripts/quotes-from-frens-config.ts /tmp/quotes-from-frens-app.json
import { readFile, writeFile } from 'node:fs/promises';
import { parseConfiguration } from '../src/shell/config.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: node --import tsx scripts/quotes-from-frens-config.ts <output of rare-profile app deploy --json>');
// The CLI's answer as saved by any shell: a byte-order mark (Windows PowerShell) or log lines around the JSON are dropped.
const text = (await readFile(input, 'utf8')).replace(/^\uFEFF/, '');
const start = text.search(/[{[]/), end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
if (start < 0 || end < start) throw new Error('No JSON in that file: paste the whole output of the deploy command.');
const raw = JSON.parse(text.slice(start, end + 1)) as unknown;

/** The object of the CLI's answer that carries the app's address (its exact nesting is the CLI's business). */
function holder(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) { for (const item of value) { const hit = holder(item); if (hit) return hit; } return undefined; }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.app_url === 'string' || typeof record.appUrl === 'string') return record;
    for (const item of Object.values(record)) { const hit = holder(item); if (hit) return hit; }
  }
  return undefined;
}
const app = holder(raw);
const appId = app?.id ?? app?.app_id ?? app?.appId;
const appUrl = app?.app_url ?? app?.appUrl;
if (typeof appId !== 'string' || typeof appUrl !== 'string') throw new Error('No app id or app_url in that file: paste the whole output of the deploy command.');
const origin = new URL(appUrl).origin;                    // scheme + host, no path, no trailing slash
if (!/^https:\/\/[a-z0-9-]+\.srstudio\.dev$/.test(origin)) throw new Error(`Unexpected app address: ${origin}`);

const configuration = parseConfiguration({
  appId, groupId: '60faaf46-ba4b-460c-a82a-adb852371a94',   // THE WALL ARCADE's shared credit group (never create one)
  studioUrl: 'https://studio.superrare.com', apiUrl: 'https://api.superrare.com', connectUrl: 'https://connect.superrare.com',
  appOrigin: origin, display: 'embed', game: 'quotes-from-frens', hubUrl: 'https://6972mvu4.srstudio.dev/',
});
await writeFile('deploy/quotes-from-frens.config.json', `${JSON.stringify(configuration, null, 2)}\n`);
console.log(`deploy/quotes-from-frens.config.json written: app ${configuration.appId} at ${configuration.appOrigin}\n`);
console.log('Next (and every time the game changes):');
console.log(`npm run build -- --config deploy/quotes-from-frens.config.json --output dist/quotes-from-frens.zip --force && rare-profile app update ${configuration.appId} --zip dist/quotes-from-frens.zip --max-attempts 10000 --json`);
