const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const raiz = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');
const fb = JSON.parse(raiz('firebase.json')).hosting;
const cabecalhos = (fonte) => Object.fromEntries((fb.headers.find((h) => h.source === fonte) || { headers: [] }).headers.map((h) => [h.key, h.value]));

test('hospedagem: Firebase Hosting publica só a pasta src no site systekna-feedback', () => {
  assert.equal(fb.site, 'systekna-feedback');
  assert.equal(fb.public, 'src');
  assert.ok(fb.ignore.includes('**/.*'), 'arquivos ocultos ficam de fora');
  assert.equal(JSON.parse(raiz('.firebaserc')).projects.default, 'systekna-feedback');
});

test('hospedagem: cabeçalhos de segurança em todas as respostas', () => {
  const h = cabecalhos('**');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Content-Security-Policy'], "frame-ancestors 'none'");
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'no-referrer');
  assert.equal(h['X-Robots-Tag'], 'noindex');
  assert.match(h['Strict-Transport-Security'], /max-age=\d{8}/);
  assert.match(h['Permissions-Policy'], /camera=\(\)/);
  assert.match(h['Permissions-Policy'], /publickey-credentials-get=\(self\)/, 'biometria (passkey) continua liberada');
});

test('hospedagem: html, js, json e css nunca ficam velhos no cache do navegador', () => {
  assert.equal(cabecalhos('**/*.@(html|js|json|css)')['Cache-Control'], 'no-cache');
  assert.equal(cabecalhos('/')['Cache-Control'], 'no-cache');
});

test('hospedagem: GitHub Pages publica a mesma pasta src a cada push na main', () => {
  const wf = raiz('.github/workflows/static.yml');
  assert.match(wf, /branches: \["main"\]/);
  assert.match(wf, /path: '\.\/src'/);
});
