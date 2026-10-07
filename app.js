/* Painel de feedback — lê avaliações e sugestões do Firestore (projeto systekna-feedback).
   Login por e-mail e senha; só a conta dona (UID nas regras) lê, marca como lida e apaga sugestões.
   Texto vindo dos usuários é sempre inserido com textContent, nunca como HTML. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';
import {
  initializeAuth, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const C = window.PainelCore;

// Mesma config e chave reCAPTCHA dos apps (não são segredos: quem protege são as regras e o App Check)
const app = initializeApp({
  apiKey: 'AIzaSyCQx8kJyXEReASiQMI4a5bT5NNWgtBmJpM',
  authDomain: 'systekna-feedback.firebaseapp.com',
  projectId: 'systekna-feedback',
  appId: '1:870927975015:web:0576bd5e3cdd8d067d8ac2',
});
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider('6LehydgtAAAAAOqkwKOQPzg2m0CZwYTRZSXPeyyx'), isTokenAutoRefreshEnabled: true });
// initializeAuth sem popup/redirect: não carrega iframe do Firebase (CSP mais curta)
const auth = initializeAuth(app, { persistence: browserLocalPersistence });
const db = getFirestore(app);

// Não abre dentro de iframe de outro site
if (window.top !== window.self) window.top.location = window.self.location;

const $ = (id) => document.getElementById(id);
const icon = (n, size = 14) => (window.FinancIcons ? FinancIcons.svg(n, { size }) : '');
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}
function msg(alvo, texto, tipo = '') { alvo.textContent = texto; alvo.className = 'msg' + (tipo ? ' ' + tipo : ''); }

// ───────── Entrar / sair ─────────
const ERROS_LOGIN = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos ou redefina a senha.',
  'auth/network-request-failed': 'Sem conexão. Tente de novo.',
  'auth/user-disabled': 'Esta conta foi desativada.',
};
const UiEvents = {
  formEntrar_submit: async (e) => {
    e.preventDefault();
    const b = $('btnEntrar');
    b.disabled = true; msg($('msgEntrar'), 'Entrando…');
    try {
      await signInWithEmailAndPassword(auth, $('email').value.trim(), $('senha').value);
      $('senha').value = '';
      msg($('msgEntrar'), '');
    } catch (err) {
      msg($('msgEntrar'), ERROS_LOGIN[err.code] || 'Não foi possível entrar. Tente de novo.', 'err');
    } finally { b.disabled = false; }
  },
  btnEsqueci_click: async () => {
    const email = $('email').value.trim();
    if (!C.emailValido(email)) { msg($('msgEntrar'), 'Digite seu e-mail acima e toque de novo em "Esqueci a senha".', 'err'); $('email').focus(); return; }
    try { await sendPasswordResetEmail(auth, email); } catch (_) { /* não revela se a conta existe */ }
    msg($('msgEntrar'), 'Se o e-mail tiver conta, o link para criar uma nova senha chega em alguns minutos (veja também o spam).', 'ok');
  },
  btnSair_click: () => signOut(auth)
};

$('formEntrar').addEventListener('submit', UiEvents.formEntrar_submit);
$('btnEsqueci').addEventListener('click', UiEvents.btnEsqueci_click);
$('btnSair').addEventListener('click', UiEvents.btnSair_click);

// ───────── Dados ao vivo ─────────
let avaliacoes = [], sugestoes = [], pararAval = null, pararSug = null;
const filtro = { status: 'novas', tipo: '', app: '', busca: '' };

onAuthStateChanged(auth, (user) => {
  $('telaEntrar').hidden = !!user;
  $('telaPainel').hidden = !user;
  if (pararAval) pararAval(); if (pararSug) pararSug();
  pararAval = pararSug = null;
  avaliacoes = []; sugestoes = [];
  if (!user) { $('email').focus(); return; }
  $('quem').textContent = user.email;
  msg($('msgPainel'), '');
  const doc2 = (d) => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm ? d.data().criadoEm.toDate() : null });
  pararAval = onSnapshot(collection(db, 'avaliacoes'),
    (snap) => { avaliacoes = snap.docs.map(doc2); render(); },
    (err) => falha(err));
  pararSug = onSnapshot(query(collection(db, 'sugestoes'), orderBy('criadoEm', 'desc')),
    (snap) => { sugestoes = snap.docs.map(doc2); render(); },
    (err) => falha(err));
});
function falha(err) {
  const semAcesso = err && err.code === 'permission-denied';
  msg($('msgPainel'), semAcesso
    ? 'Esta conta não tem acesso às sugestões. Só a conta dona do projeto pode lê-las.'
    : 'Não foi possível carregar os dados. Verifique a conexão e recarregue a página.', 'err');
}

// ───────── Render ─────────
function render() {
  const r = C.resumo(avaliacoes);
  $('tMedia').textContent = r.geral.total ? C.media(r.geral.media) : '–';
  $('tAval').textContent = String(r.geral.total);
  $('tSug').textContent = String(sugestoes.length);
  $('tNovas').textContent = String(sugestoes.filter((s) => !s.lida).length);
  $('atualizado').textContent = 'ao vivo · ' + C.dataHora(new Date()).slice(11);
  renderApps(r);
  renderFiltroApp();
  renderSugestoes();
}

function estrelas(m) {
  const s = el('span', 'estrelas');
  const cheias = Math.round(m);
  for (let i = 1; i <= 5; i++) s.append(el('span', i <= cheias ? '' : 'off', '★'));
  s.setAttribute('aria-label', `${C.media(m)} de 5`);
  return s;
}

function renderApps(r) {
  const box = $('listaApps');
  box.replaceChildren();
  const ids = Object.keys(r.porApp).sort((a, b) => r.porApp[b].total - r.porApp[a].total || C.nomeApp(a).localeCompare(C.nomeApp(b)));
  for (const id of ids) {
    const a = r.porApp[id];
    const card = el('article', 'app-card' + (a.total ? '' : ' vazio'));
    const h = el('h3', '', C.nomeApp(id));
    h.append(el('span', 'num', `${a.total} ${a.total === 1 ? 'avaliação' : 'avaliações'}`));
    if (!a.total) {
      card.append(h, el('div', 'row-meta', 'Sem avaliações ainda'));
      box.append(card);
      continue;
    }
    const m = el('div', 'app-media');
    m.append(el('b', '', C.media(a.media)), estrelas(a.media));
    const dist = el('div', 'dist');
    for (let n = 5; n >= 1; n--) {
      const qtd = a.dist[n - 1];
      const barra = el('div', 'progress' + (n <= 2 ? ' danger' : n === 3 ? ' warn' : ''));
      const preenchido = el('span');
      preenchido.style.width = (a.total ? (qtd / a.total) * 100 : 0) + '%';
      barra.append(preenchido);
      dist.append(el('span', '', n + '★'), barra, el('span', 'num', String(qtd)));
    }
    card.append(h, m, dist);
    box.append(card);
  }
}

function renderFiltroApp() {
  const sel = $('fApp');
  const ids = [...new Set([...Object.keys(C.APPS), ...sugestoes.map((s) => s.app)])];
  if (sel.options.length - 1 === ids.length) return;
  const atual = sel.value;
  sel.replaceChildren(new Option('Todos os apps', ''));
  ids.forEach((id) => sel.append(new Option(C.nomeApp(id), id)));
  sel.value = atual;
}

const BADGE_TIPO = { problema: 'badge-neg', elogio: 'badge-pos', sugestao: 'badge-info' };
function renderSugestoes() {
  const box = $('listaSug');
  const lista = C.filtrar(sugestoes, filtro);
  box.replaceChildren();
  if (!lista.length) {
    const vazio = el('div', 'empty-state');
    vazio.innerHTML = icon('message-square', 28);
    vazio.append(el('div', 'title', sugestoes.length ? 'Nada com esses filtros' : 'Nenhuma sugestão ainda'),
      el('div', 'desc', sugestoes.length ? 'Troque o status, o tipo ou a busca.' : 'As mensagens enviadas pelos apps aparecem aqui na hora.'));
    box.append(vazio);
    return;
  }
  for (const s of lista) box.append(itemSugestao(s));
}

function itemSugestao(s) {
  const item = el('article', 'sug' + (s.lida ? ' lida' : ''));
  const topo = el('div', 'sug-topo');
  topo.append(el('span', 'ponto'), el('span', 'badge ' + (BADGE_TIPO[s.tipo] || 'badge-neutral'), C.nomeTipo(s.tipo)),
    el('span', 'badge badge-neutral', C.nomeApp(s.app)));
  const quando = el('span', 'row-meta', C.relativo(s.criadoEm));
  quando.title = C.dataHora(s.criadoEm);
  topo.append(quando);
  item.append(topo, el('p', 'sug-texto', s.texto));
  if (s.email) item.append(el('div', 'sug-email', s.email));

  const acoes = el('div', 'row-actions');
  const resposta = C.linkResposta(s);
  if (resposta) {
    const a = el('a', 'btn btn-secondary btn-sm', 'Responder');
    a.href = resposta;
    acoes.append(a);
  }
  const bLida = el('button', 'btn btn-secondary btn-sm', s.lida ? 'Marcar como nova' : 'Marcar como lida');
  bLida.type = 'button';
  bLida.addEventListener('click', () => acao(bLida, () => updateDoc(doc(db, 'sugestoes', s.id), { lida: !s.lida })));
  const bApagar = el('button', 'btn btn-danger btn-sm', 'Excluir');
  bApagar.type = 'button';
  // Excluir pede um segundo toque em 4 s (sem confirm(), que trava o navegador em alguns contextos)
  bApagar.addEventListener('click', () => {
    if (!bApagar.classList.contains('confirmar')) {
      bApagar.classList.add('confirmar'); bApagar.textContent = 'Toque de novo para excluir';
      setTimeout(() => { bApagar.classList.remove('confirmar'); bApagar.textContent = 'Excluir'; }, 4000);
      return;
    }
    acao(bApagar, () => deleteDoc(doc(db, 'sugestoes', s.id)));
  });
  acoes.append(bLida, bApagar);
  item.append(acoes);
  return item;
}

async function acao(botao, fn) {
  botao.disabled = true;
  try { await fn(); msg($('msgPainel'), ''); }
  catch (err) { botao.disabled = false; falha(err); }
}

// ───────── Filtros ─────────
function ligarSeg(id, chave) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    filtro[chave] = b.dataset.v;
    renderSugestoes();
  });
}
ligarSeg('fStatus', 'status');
ligarSeg('fTipo', 'tipo');
let tBusca;
const UiEventsFiltro = {
  fApp_change: (e) => { filtro.app = e.target.value; renderSugestoes(); },
  fBusca_input: (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { filtro.busca = e.target.value; renderSugestoes(); }, 200); },
  btnCsv_click: () => {
    const lista = C.filtrar(sugestoes, filtro);
    const url = URL.createObjectURL(new Blob([C.csv(lista)], { type: 'text/csv;charset=utf-8' }));
    const a = el('a');
    a.href = url; a.download = `feedback-sugestoes-${C.dataHora(new Date()).slice(0, 10).split('/').reverse().join('-')}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

$('fApp').addEventListener('change', UiEventsFiltro.fApp_change);
$('fBusca').addEventListener('input', UiEventsFiltro.fBusca_input);
$('btnCsv').addEventListener('click', UiEventsFiltro.btnCsv_click);
