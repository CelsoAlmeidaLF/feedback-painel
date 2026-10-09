const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const src = (f) => path.join(__dirname, '..', 'src', f);
const html = readFileSync(src('index.html'), 'utf8');
const sw = readFileSync(src('sw.js'), 'utf8');
const manifest = JSON.parse(readFileSync(src('manifest.json'), 'utf8'));
// Largura e altura gravadas no cabeçalho IHDR do PNG
const tamanhoPng = (f) => { const b = readFileSync(src(f)); assert.equal(b.toString('ascii', 1, 4), 'PNG', f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('pwa: manifesto instalável (nome, tela cheia, ícones 192, 512 e maskable)', () => {
  assert.equal(manifest.short_name, 'Feedback');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  for (const tam of ['192x192', '512x512']) assert.ok(manifest.icons.some((i) => i.sizes === tam && i.purpose === 'any'), tam);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const i of manifest.icons) assert.deepEqual(tamanhoPng(i.src), i.sizes.split('x').map(Number), i.src);
  assert.deepEqual(tamanhoPng('apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(tamanhoPng('favicon-32.png'), [32, 32]);
  assert.match(html, /<link rel="manifest" href="manifest.json">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon.png">/);
});

test('pwa: service worker guarda todos os arquivos da tela e tem a versão do app', () => {
  const versao = html.match(/data-vault-version="(\d+\.\d+\.\d+)"/)[1];
  assert.match(sw, new RegExp(`CACHE_NAME = 'feedback-painel-v${versao.replace(/\./g, '\\.')}'`));
  const locais = [...html.matchAll(/(?:href|src)="([^":#?]+\.(?:css|js|json|png|woff2))"/g)].map((m) => m[1]);
  locais.push('fonts/open-sans.woff2');
  for (const f of new Set(locais)) {
    assert.ok(existsSync(src(f)), 'arquivo existe: ' + f);
    assert.ok(sw.includes(`'./${f}'`), 'no cache do SW: ' + f);
  }
  assert.match(sw, /origin !== self\.location\.origin\) return/, 'Firebase e outros domínios nunca passam pelo cache');
});
