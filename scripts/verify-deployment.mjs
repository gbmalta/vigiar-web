import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL(process.argv[2] || 'http://127.0.0.1:4173/vigiar-web/');
assert(base.pathname.endsWith('/'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const get = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `HTTP ${response.status}: ${url}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') || '' };
};
const page = await get(base);
assert(page.type.includes('text/html'));
const html = page.bytes.toString();
assert(html.includes('VIGIAR') && html.includes('lang="pt-BR"'));
const resources = new Set();
for (const [, name] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  const url = new URL(name, base);
  if (url.origin === base.origin) {
    assert(url.pathname.startsWith(base.pathname), `Resource outside the Pages base: ${url}`);
    resources.add(url.href);
  }
}
const checked = new Set();
while (resources.size) {
  const url = resources.values().next().value;
  resources.delete(url);
  if (checked.has(url)) continue;
  checked.add(url);
  const response = await get(url);
  const pathname = new URL(url).pathname;
  assert(!response.type.includes('text/html'), `Unexpected HTML instead of asset: ${url}`);
  if (/\.(js|css)$/.test(pathname)) {
    const text = response.bytes.toString();
    const patterns = pathname.endsWith('.css')
      ? [/url\(["']?([^)'"\s]+)["']?\)/g]
      : [/import\(["']([^"']+)["']\)/g, /from\s*["']([^"']+)["']/g];
    for (const pattern of patterns) for (const [, dependency] of text.matchAll(pattern)) {
      if (dependency.startsWith('data:') || dependency.startsWith('#')) continue;
      if (pathname.endsWith('.js') && !/^(?:\.\.?\/|\/).+\.(?:m?js|css)(?:\?.*)?$/.test(dependency)) continue;
      const asset = new URL(dependency, url);
      if (asset.origin === base.origin) {
        assert(asset.pathname.startsWith(base.pathname), `Dependency outside the Pages base: ${asset}`);
        resources.add(asset.href);
      }
    }
  }
}
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory() ? files(path.join(dir, entry.name), `${name}/`) : [name];
  });
}
const publicDir = path.join(root, 'public');
const list = files(publicDir);
for (let index = 0; index < list.length; index += 5) {
  await Promise.all(list.slice(index, index + 5).map(async (name) => {
    const result = await get(new URL(name, base));
    assert.equal(hash(result.bytes), hash(readFileSync(path.join(publicDir, name))), `${name}: deployed content differs`);
  }));
}
console.log(JSON.stringify({ url: base.href, publicFiles: list.length, applicationAssets: checked.size, status: 'passed', checks: ['HTML', 'repository base paths', 'JS/CSS/fonts/lazy imports', 'all public file hashes'] }, null, 2));
