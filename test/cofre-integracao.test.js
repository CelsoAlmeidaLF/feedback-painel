const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ler = (f) => readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const html = ler('index.html'), app = ler('app.js');

test('cofre: o painel abre pelo kit de segurança (PIN FINANC / biometria)', () => {
  assert.match(html, /<html[^>]*class="vault-locked"[^>]*data-vault-app="feedback-painel"/);
  const ordem = ['stk-pkg-financ-icons.js', 'stk-pkg-secure-vault.js', 'stk-pkg-secure-ui.js', 'painel-core.js', 'app.js'].map((f) => html.indexOf(`src="${f}"`));
  assert.ok(ordem.every((i) => i > 0), 'todos os scripts presentes');
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, 'kit antes do app');
  assert.ok(html.indexOf('stk-pkg-secure-ui.css') < html.indexOf('painel.css'), 'o painel sobrescreve as cores do kit');
  assert.match(html, /data-vault-profile-slot/, 'menu ⋮ no cabeçalho');
});

test('cofre: login só depois do desbloqueio e sessão do Firebase só na memória', () => {
  assert.match(app, /persistence: inMemoryPersistence/);
  assert.doesNotMatch(app, /browserLocalPersistence/);
  assert.ok(app.indexOf('await window.vaultReady') < app.indexOf('onAuthStateChanged(auth'), 'espera o cofre antes de ouvir o login');
  assert.match(app, /deleteDatabase\('firebaseLocalStorageDb'\)/, 'apaga o token antigo salvo sem cifra');
});

test('cofre: senha só vai para o secureStorage, nunca para localStorage', () => {
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*(senha|conta)/i);
  assert.match(app, /secureStorage\.setItem\(C\.CHAVE_CONTA, C\.gravarCredenciais/);
  const versao = html.match(/data-vault-version="(\d+\.\d+\.\d+)"/);
  assert.ok(versao, 'versão no html');
});

test('acesso: o painel só abre depois que o Firestore confirma a conta como dona', () => {
  const ouvinte = app.slice(app.indexOf('onAuthStateChanged(auth'), app.indexOf('function liberar('));
  assert.match(ouvinte, /\$\('telaPainel'\)\.hidden = true;/, 'começa escondido a cada mudança de login');
  assert.doesNotMatch(ouvinte, /\$\('telaPainel'\)\.hidden = (false|!user)/, 'login sozinho não abre o painel');
  assert.match(ouvinte, /negado\(user, err\)/, 'leitura recusada vai para negado()');
  const mostra = [...app.matchAll(/\$\('telaPainel'\)\.hidden = false/g)].length;
  assert.equal(mostra, 1, 'só um lugar abre o painel');
  assert.ok(app.indexOf("$('telaPainel').hidden = false") > app.indexOf('function liberar('), 'e esse lugar é liberar()');
  const neg = app.slice(app.indexOf('async function negado('), app.indexOf('function falha('));
  assert.match(neg, /signOut\(auth\)/, 'acesso recusado sai da conta');
});
