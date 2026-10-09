/* Painel de feedback — design Aero 3.0, com avaliações, sugestões e relatórios de erro do Firestore (projeto systekna-feedback).
   Login por e-mail e senha; só a conta dona (UID nas regras) lê, marca como lida e apaga.
   Texto vindo dos usuários é sempre inserido com textContent, nunca como HTML. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';
import {
  initializeAuth, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch,
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

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ico = (n, s) => FinancIcons.svg(n, { size: s || 16, stroke: 1.9 });
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}
function msg(alvo, texto, tipo = '') { alvo.textContent = texto; alvo.className = alvo.className.replace(/\s(err|ok)\b/g, '') + (tipo ? ' ' + tipo : ''); }

// Cores e ícone de cada app nos cartões (só visual)
const VISUAL = {
  CAMBIO: ['#7CCBF8', '#1A7AD4', 'arrow-left-right'], CRIPTO: ['#F5CB6E', '#C98512', 'database'],
  LIVROCAIXA: ['#6FD38A', '#23863A', 'file-text'], TAXOMETRO: ['#C9A6F5', '#7A4FC4', 'clock'],
  INVEST: ['#F49A8A', '#C2412F', 'trending-up'],
};
const TIPOS = { sugestao: 'badge-info', problema: 'badge-neg', elogio: 'badge-pos' };

// ═════ Modo: claro → escuro → luz ambiente ═════
let pref = 'ambient';
try { pref = localStorage.getItem('painel-modo') || 'ambient'; } catch (_) {}
const ceu = () => { const h = new Date().getHours(); return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night'; };
function aplicarModo() {
  let mode = pref, sky = '';
  if (pref === 'ambient') { const k = ceu(); mode = k === 'night' ? 'dark' : 'light'; sky = k === 'dawn' || k === 'dusk' ? k : ''; }
  root.dataset.mode = mode;
  if (sky) root.dataset.sky = sky; else delete root.dataset.sky;
  $('metaTheme').content = mode === 'dark' ? '#0B1B33' : sky === 'dawn' ? '#F6DCCB' : sky === 'dusk' ? '#EBD3E6' : '#DCEBFA';
  const icone = ico(pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'clock', 20);
  $('btnModo').innerHTML = icone; $('btnModoEntrar').innerHTML = icone;
}
function trocarModo() {
  pref = pref === 'light' ? 'dark' : pref === 'dark' ? 'ambient' : 'light';
  try { localStorage.setItem('painel-modo', pref); } catch (_) {}
  aplicarModo(); toast({ light: 'Modo claro', dark: 'Modo escuro', ambient: 'Luz ambiente' }[pref]);
}
aplicarModo();
setInterval(() => { if (pref === 'ambient') aplicarModo(); }, 60000);
$('btnModo').addEventListener('click', trocarModo);
$('btnModoEntrar').addEventListener('click', trocarModo);

// ═════ Avisos: toast e "Desfazer" ═════
let tT, tS, desfazerFn = null, confirmarFn = null;
function toast(m) { $('toastT').textContent = m; $('toast').classList.add('show'); clearTimeout(tT); tT = setTimeout(() => $('toast').classList.remove('show'), 2200); }
// A exclusão só vai para o Firestore quando o "Desfazer" expira.
function snack(m, desfazer, confirmar) {
  if (confirmarFn) confirmarFn();
  desfazerFn = desfazer; confirmarFn = confirmar;
  $('snackT').textContent = m; $('snack').classList.add('show'); clearTimeout(tS);
  tS = setTimeout(() => { $('snack').classList.remove('show'); const f = confirmarFn; desfazerFn = confirmarFn = null; if (f) f(); }, 4500);
}
$('desfazer').addEventListener('click', () => { clearTimeout(tS); const f = desfazerFn; desfazerFn = confirmarFn = null; $('snack').classList.remove('show'); if (f) f(); });
addEventListener('pagehide', () => { if (confirmarFn) { const f = confirmarFn; confirmarFn = null; f(); } });

// ═════ Segmentados com indicador que desliza ═════
function seletor(seg, aoMudar) {
  const btns = [...seg.querySelectorAll('button')], ind = seg.querySelector('.ind');
  const attr = btns[0].hasAttribute('aria-selected') ? 'aria-selected' : 'aria-pressed';
  const mover = () => { const b = btns.find((x) => x.getAttribute(attr) === 'true') || btns[0]; if (!b.offsetWidth) return; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 3}px)`; };
  btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.setAttribute(attr, String(x === b))); mover(); aoMudar(b.dataset.v); }));
  addEventListener('resize', mover); requestAnimationFrame(mover);
  return mover;
}

// ═════ Cartão da média inclinável e paralaxe do fundo ═════
const bal = $('bal');
if (!RM) {
  bal.addEventListener('pointermove', (e) => {
    const r = bal.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    bal.style.transform = `rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg)`;
    bal.style.setProperty('--sx', x * 100 + '%'); bal.style.setProperty('--sy', y * 100 + '%'); bal.classList.add('tilting');
  });
  bal.addEventListener('pointerleave', () => { bal.style.transform = ''; bal.classList.remove('tilting'); });
  const orbs = document.querySelectorAll('.orbs i');
  addEventListener('scroll', () => orbs.forEach((o, i) => { o.style.transform = `translateY(${-scrollY * (0.08 + i * 0.05)}px)`; }), { passive: true });
}

// ═════ Entrar / sair ═════
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
  btnSair_click: () => { if (confirmarFn) { const f = confirmarFn; confirmarFn = null; f(); } signOut(auth); },
};
$('formEntrar').addEventListener('submit', UiEvents.formEntrar_submit);
$('btnEsqueci').addEventListener('click', UiEvents.btnEsqueci_click);
$('btnSair').addEventListener('click', UiEvents.btnSair_click);

// ═════ Dados ao vivo ═════
let avaliacoes = [], sugestoes = [], erros = [], carregou = false, pararAval = null, pararSug = null, pararErros = null;
const ocultos = new Set(); // ids esperando o "Desfazer" expirar
const filtro = { status: 'novas', tipo: '', app: '', busca: '' };
const filtroErro = { status: 'abertos', app: '', versao: '' };

onAuthStateChanged(auth, (user) => {
  $('telaEntrar').hidden = !!user;
  $('telaPainel').hidden = !user;
  if (pararAval) pararAval(); if (pararSug) pararSug(); if (pararErros) pararErros();
  pararAval = pararSug = pararErros = null;
  avaliacoes = []; sugestoes = []; erros = []; carregou = false; ocultos.clear();
  if (!user) { $('email').focus(); return; }
  $('avatar').textContent = C.iniciais(user.email);
  $('avatar').title = user.email;
  const h = new Date().getHours();
  $('ola').textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  msg($('msgPainel'), ''); msg($('msgErros'), '');
  esqueleto();
  requestAnimationFrame(() => { moverVisao(); moverStatus(); });
  const doc2 = (d) => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm ? d.data().criadoEm.toDate() : null });
  pararAval = onSnapshot(collection(db, 'avaliacoes'),
    (snap) => { avaliacoes = snap.docs.map(doc2); carregou = true; renderFeedback(); },
    (err) => falha(err));
  pararSug = onSnapshot(query(collection(db, 'sugestoes'), orderBy('criadoEm', 'desc')),
    (snap) => { sugestoes = snap.docs.map(doc2); carregou = true; renderFeedback(); },
    (err) => falha(err));
  pararErros = onSnapshot(query(collection(db, 'erros'), orderBy('criadoEm', 'desc')),
    (snap) => { erros = snap.docs.map(doc2); renderErros(); ilha(); },
    (err) => msg($('msgErros'), err && err.code === 'permission-denied'
      ? 'Sem acesso aos erros. Publique as regras do Firestore com a coleção "erros".'
      : 'Não foi possível carregar os erros. Verifique a conexão e recarregue a página.', 'err'));
});
function falha(err) {
  const semAcesso = err && err.code === 'permission-denied';
  msg($('msgPainel'), semAcesso
    ? 'Esta conta não tem acesso às sugestões. Só a conta dona do projeto pode lê-las.'
    : 'Não foi possível carregar os dados. Verifique a conexão e recarregue a página.', 'err');
}
const sugVisiveis = () => sugestoes.filter((s) => !ocultos.has(s.id));
const errosVisiveis = () => erros.filter((e) => !ocultos.has(e.id));

// ═════ Ilha viva ═════
let ilhaAcao = null;
function ilha() {
  const d = C.destaque(sugVisiveis(), C.agruparErros(errosVisiveis(), { status: 'abertos' }), new Date());
  if (d.tipo === 'erro') {
    $('ilhaT').textContent = 'Erro novo no ' + C.nomeApp(d.app); $('ilhaV').textContent = d.vezes + '×';
    $('ilhaD').textContent = d.mensagem + ' · ' + C.relativo(d.quando); $('ilhaGo').textContent = 'Ver erros';
    ilhaAcao = () => trocarVisao('erros');
  } else if (d.tipo === 'sugestoes') {
    $('ilhaT').textContent = d.total + (d.total === 1 ? ' sugestão nova' : ' sugestões novas'); $('ilhaV').textContent = '';
    $('ilhaD').textContent = 'Mais recente: ' + C.nomeApp(d.app) + ' · ' + C.relativo(d.quando); $('ilhaGo').textContent = 'Ver sugestões';
    ilhaAcao = () => { trocarVisao('feedback'); $('listaSug').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); };
  } else {
    $('ilhaT').textContent = 'Tudo em dia'; $('ilhaV').textContent = '';
    $('ilhaD').textContent = 'Nenhuma sugestão nova nem erro aberto nas últimas 24 h.'; $('ilhaGo').textContent = 'Fechar'; ilhaAcao = null;
  }
}
const isl = $('island');
const alternarIlha = () => { const o = isl.classList.toggle('open'); isl.setAttribute('aria-expanded', String(o)); };
isl.addEventListener('click', (e) => { if (!e.target.closest('button')) alternarIlha(); });
isl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarIlha(); } });
$('ilhaGo').addEventListener('click', () => { isl.classList.remove('open'); isl.setAttribute('aria-expanded', 'false'); if (ilhaAcao) ilhaAcao(); });

// ═════ FEEDBACK ═════
function estrelas(alvo, m) {
  alvo.replaceChildren();
  const cheias = Math.round(m);
  alvo.append('★'.repeat(cheias), el('span', 'off', '★'.repeat(5 - cheias)));
}
function renderFeedback() {
  const sugs = sugVisiveis(), r = C.resumo(avaliacoes);
  $('tMedia').textContent = r.geral.total ? C.media(r.geral.media) : '–';
  if (r.geral.total) estrelas($('tEstrelas'), r.geral.media); else $('tEstrelas').replaceChildren();
  $('tAval').textContent = String(r.geral.total);
  $('tNovas').textContent = String(sugs.filter((s) => !s.lida).length);
  $('tSug').textContent = String(sugs.length);
  $('tProb').textContent = String(sugs.filter((s) => s.tipo === 'problema' && !s.lida).length);
  $('atualizado').textContent = 'ao vivo · ' + C.dataHora(new Date()).slice(11);
  renderEvolucao(); renderApps(r); renderFiltroApp(); renderSugestoes(); ilha(); contErros();
}

function renderApps(r) {
  const box = $('listaApps'); box.replaceChildren();
  const ids = Object.keys(r.porApp).sort((a, b) => r.porApp[b].total - r.porApp[a].total || C.nomeApp(a).localeCompare(C.nomeApp(b)));
  for (const id of ids) {
    const a = r.porApp[id], [ca, cb, ic] = VISUAL[id] || ['#B8C6D6', '#5A6F88', 'star'];
    const card = el('article', 'glass flat app-c' + (a.total ? '' : ' vazio'));
    const h = el('div', 'app-h'), d = el('span', 'dot');
    d.style.setProperty('--a', ca); d.style.setProperty('--b', cb); d.innerHTML = ico(ic, 18);
    const t = el('div');
    t.append(el('b', '', C.nomeApp(id)), el('small', '', a.total ? `${a.total} ${a.total === 1 ? 'avaliação' : 'avaliações'}` : 'Sem avaliações ainda'));
    h.append(d, t);
    const td = C.tendencia(avaliacoes.filter((x) => x.app === id), new Date());
    if (td) { const b = el('span', 'tend ' + td.cls, td.txt); b.style.marginLeft = 'auto'; b.title = 'Média dos últimos 30 dias comparada aos 30 anteriores'; h.append(b); }
    card.append(h);
    if (a.total) {
      const rt = el('div', 'rating'), st = el('span', 'stars');
      estrelas(st, a.media); st.setAttribute('aria-label', C.media(a.media) + ' de 5');
      rt.append(el('b', 'num', C.media(a.media)), st);
      const dist = el('div', 'dist');
      for (let n = 5; n >= 1; n--) {
        const q = a.dist[n - 1], tr = el('div', 'track' + (n <= 2 ? ' d' : n === 3 ? ' w' : '')), f = el('i');
        tr.append(f); dist.append(el('span', '', n + '★'), tr, el('span', 'num', String(q)));
        setTimeout(() => f.style.setProperty('--v', (q / a.total * 100) + '%'), 150);
      }
      card.append(rt, dist);
    }
    box.append(card);
  }
}

// ═════ Evolução da nota ═════
let evoApp = '';
function renderEvolucao() {
  const chips = $('evoApp');
  if (!chips.children.length) {
    [['', 'Todos'], ...C.PRINCIPAIS.map((id) => [id, C.nomeApp(id)])].forEach(([v, n]) => {
      const c = el('button', 'chip', n); c.type = 'button'; c.dataset.v = v; c.setAttribute('aria-pressed', String(v === evoApp));
      c.addEventListener('click', () => { evoApp = v; chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); renderEvolucao(); });
      chips.append(c);
    });
  }
  const lista = avaliacoes.filter((a) => !evoApp || a.app === evoApp), agora = new Date();
  const sem = C.mediasSemanais(lista, agora, 8), r = C.resumo(lista);
  $('evoRot').textContent = evoApp ? C.nomeApp(evoApp) : 'Todos os apps';
  $('evoMedia').textContent = r.geral.total ? C.media(r.geral.media) : '–';
  const td = C.tendencia(lista, agora), te = $('evoTend');
  te.className = 'tend ' + (td ? td.cls : 'igual'); te.textContent = td ? td.txt : 'sem base';
  // 8 semanas, escala de 1 a 5 (só números entram no SVG)
  const W = 320, H = 150, L = 6, R = 6, T = 10, B = 24, X = (i) => L + i * (W - L - R) / 7, Y = (v) => T + (5 - v) / 4 * (H - T - B);
  const pts = sem.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
  let svg = '<defs><linearGradient id="evoArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>';
  [5, 4, 3, 2, 1].forEach((v) => { svg += `<line class="grade" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`; });
  if (pts.length > 1) {
    const d = 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L');
    svg += `<path d="${d} L${pts[pts.length - 1][0].toFixed(1)},${H - B} L${pts[0][0].toFixed(1)},${H - B} Z" fill="url(#evoArea)"/>`;
    svg += `<path class="linha${RM ? '' : ' desenha'}" d="${d}"/>`;
  }
  pts.forEach((p) => { svg += `<circle class="ponto-g" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"/>`; });
  svg += `<text x="${X(0)}" y="${H - 6}" text-anchor="start">8 sem</text><text x="${X(7)}" y="${H - 6}" text-anchor="end">agora</text>`;
  if (!pts.length) svg += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Sem avaliações no período</text>`;
  const g = $('grafico'); g.innerHTML = svg;
  const ln = g.querySelector('.linha'); if (ln) ln.style.setProperty('--len', Math.ceil(ln.getTotalLength()));
}

function renderFiltroApp() {
  const sel = $('fApp');
  const ids = [...new Set([...C.PRINCIPAIS, ...sugestoes.map((s) => s.app)])];
  if (sel.options.length - 1 === ids.length) return;
  const atual = sel.value;
  sel.replaceChildren(new Option('Todos os apps', ''));
  ids.forEach((id) => sel.append(new Option(C.nomeApp(id), id)));
  sel.value = atual;
}

function vazio(box, icone, titulo, desc) {
  const v = el('div', 'glass flat empty-state'), o = el('div', 'orb'); o.innerHTML = ico(icone, 26);
  v.append(o, el('div', 'title', titulo), el('div', 'desc', desc)); box.append(v);
}
function renderSugestoes() {
  const box = $('listaSug'), todas = sugVisiveis(), lista = C.filtrar(todas, filtro);
  box.replaceChildren();
  if (!lista.length) {
    vazio(box, 'message-square', todas.length ? 'Nada com esses filtros' : 'Nenhuma sugestão ainda',
      todas.length ? 'Troque o status, o tipo ou a busca.' : 'As mensagens enviadas pelos apps aparecem aqui na hora.');
    return;
  }
  lista.forEach((s) => box.append(cartaoSugestao(s)));
}
function cartaoSugestao(s) {
  const c = el('article', 'glass flat msg-c' + (s.lida ? ' lida' : ''));
  const al = el('div', 'act l'); al.innerHTML = ico(s.lida ? 'refresh' : 'check', 18); al.append(s.lida ? 'Nova' : 'Lida');
  const ar = el('div', 'act r'); ar.append('Excluir'); ar.insertAdjacentHTML('beforeend', ico('trash', 18));
  const inn = el('div', 'inner'), topo = el('div', 'mtopo');
  const q = el('span', 'quando', C.relativo(s.criadoEm)); q.title = C.dataHora(s.criadoEm);
  topo.append(el('span', 'ponto'), el('span', 'badge ' + (TIPOS[s.tipo] || 'badge-neutral'), C.nomeTipo(s.tipo)), el('span', 'badge badge-neutral', C.nomeApp(s.app)), q);
  inn.append(topo, el('p', 'texto', s.texto));
  if (s.email) inn.append(el('div', 'email', s.email));
  const ac = el('div', 'acoes');
  const resposta = C.linkResposta(s);
  if (resposta) { const a = el('a', 'btn btn-secondary btn-sm'); a.innerHTML = ico('arrow-left', 16); a.append(' Responder'); a.href = resposta; ac.append(a); }
  const bl = el('button', 'btn btn-secondary btn-sm'); bl.type = 'button';
  bl.innerHTML = ico(s.lida ? 'refresh' : 'check', 16); bl.append(s.lida ? ' Marcar nova' : ' Lida');
  bl.addEventListener('click', () => alternarLida(s, bl));
  const bx = el('button', 'btn btn-danger btn-sm x'); bx.type = 'button'; bx.setAttribute('aria-label', 'Excluir');
  bx.innerHTML = ico('trash', 16) + '<span>Excluir?</span>';
  // Excluir pede um segundo toque em 4 s (sem confirm(), que trava o navegador em alguns contextos)
  bx.addEventListener('click', () => {
    if (!bx.classList.contains('confirmar')) { bx.classList.add('confirmar'); setTimeout(() => bx.classList.remove('confirmar'), 4000); return; }
    excluirSugestao(s, c);
  });
  ac.append(bl, bx); inn.append(ac); c.append(al, ar, inn);
  gesto(c, inn, () => alternarLida(s), () => excluirSugestao(s, c));
  return c;
}
async function alternarLida(s, botao) {
  if (botao) botao.disabled = true;
  try { await updateDoc(doc(db, 'sugestoes', s.id), { lida: !s.lida }); toast(s.lida ? 'Marcada como nova' : 'Marcada como lida'); msg($('msgPainel'), ''); }
  catch (err) { if (botao) botao.disabled = false; falha(err); }
}
function excluirSugestao(s, c) {
  c.classList.add('sai');
  setTimeout(() => { ocultos.add(s.id); renderFeedback(); }, 350);
  snack('Sugestão excluída',
    () => { ocultos.delete(s.id); renderFeedback(); },
    () => deleteDoc(doc(db, 'sugestoes', s.id)).then(() => ocultos.delete(s.id))
      .catch((err) => { ocultos.delete(s.id); renderFeedback(); falha(err); }));
}
// Deslizar: direita = lida/nova, esquerda = excluir
function gesto(c, inn, direita, esquerda) {
  let x0 = null, dx = 0, y0 = 0;
  inn.addEventListener('pointerdown', (e) => { if (e.target.closest('button,a,summary')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; c.classList.add('drag'); });
  inn.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    if (Math.abs(e.clientY - y0) > 24 && Math.abs(dx) < 10) { fim(); return; }
    dx = Math.max(-150, Math.min(150, e.clientX - x0)); inn.style.transform = `translateX(${dx}px)`;
    c.classList.toggle('sl', dx > 30); c.classList.toggle('sr', dx < -30);
  });
  function fim() { if (x0 === null) return; x0 = null; c.classList.remove('drag', 'sl', 'sr'); inn.style.transform = ''; if (dx > 100) direita(); else if (dx < -100) esquerda(); dx = 0; }
  inn.addEventListener('pointerup', fim); inn.addEventListener('pointercancel', fim); inn.addEventListener('pointerleave', fim);
}
$('btnCsv').addEventListener('click', () => {
  const lista = C.filtrar(sugVisiveis(), filtro);
  const url = URL.createObjectURL(new Blob([C.csv(lista)], { type: 'text/csv;charset=utf-8' }));
  const a = el('a');
  a.href = url; a.download = `feedback-sugestoes-${C.dataHora(new Date()).slice(0, 10).split('/').reverse().join('-')}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV exportado');
});

// ═════ ERROS ═════
function contErros() { const n = C.agruparErros(errosVisiveis(), { status: 'abertos' }).length; $('contErros').hidden = !n; $('contErros').textContent = String(n); }
function renderErros() {
  const lista = errosVisiveis(), abertos = C.agruparErros(lista, { status: 'abertos' });
  const semana = Date.now() - 7 * 24 * 60 * 60 * 1000;
  $('eAbertos').textContent = String(abertos.length);
  $('eSemana').textContent = String(lista.filter((e) => e.criadoEm && e.criadoEm.getTime() >= semana).length);
  $('eApps').textContent = String(new Set(abertos.map((g) => g.app)).size);
  $('eUltimo').textContent = lista[0] && lista[0].criadoEm ? C.relativo(lista[0].criadoEm) : '–';
  preencher($('fErroApp'), 'Todos os apps', [...new Set(lista.map((e) => e.app))].map((id) => [id, C.nomeApp(id)]));
  preencher($('fErroVersao'), 'Todas as versões', C.versoesErros(lista, $('fErroApp').value).map((v) => [v, 'v' + v]));
  filtroErro.app = $('fErroApp').value; filtroErro.versao = $('fErroVersao').value;
  contErros();
  renderListaErros();
}
function preencher(sel, rotulo, pares) {
  const atual = sel.value;
  sel.replaceChildren(new Option(rotulo, ''));
  pares.forEach(([v, t]) => sel.append(new Option(t, v)));
  sel.value = pares.some(([v]) => v === atual) ? atual : '';
}
function renderListaErros() {
  const box = $('listaErros'), todos = errosVisiveis(), grupos = C.agruparErros(todos, filtroErro);
  box.replaceChildren();
  if (!grupos.length) {
    vazio(box, 'check', todos.length ? 'Nada com esses filtros' : 'Nenhum erro recebido',
      todos.length ? 'Troque o status, o app ou a versão.' : 'Os relatórios dos testadores aparecem aqui na hora.');
    return;
  }
  grupos.forEach((g) => box.append(cartaoErro(g)));
}
function cartaoErro(g) {
  const c = el('article', 'glass flat msg-c' + (g.resolvido ? ' lida' : '')), inn = el('div', 'inner'), topo = el('div', 'mtopo');
  const q = el('span', 'quando', C.relativo(g.ultimo)); q.title = `Primeiro: ${C.dataHora(g.primeiro)} · Último: ${C.dataHora(g.ultimo)}`;
  topo.append(el('span', 'ponto'), el('span', 'badge ' + (g.resolvido ? 'badge-pos' : 'badge-vez'), g.resolvido ? 'Resolvido' : g.vezes + '×'),
    el('span', 'badge badge-neutral', `${C.nomeApp(g.app)} v${g.versao || '?'}`), el('span', 'badge badge-info', C.TIPO_ERRO[g.tipo] || g.tipo || 'Erro'), q);
  inn.append(topo, el('p', 'erro-msg', g.mensagem));
  const meta = [g.origem, ...g.navegadores].filter(Boolean).join(' · ');
  if (meta) inn.append(el('div', 'meta', meta));
  if (g.pilha) {
    const d = el('details', 'pilha'), s = el('summary');
    s.innerHTML = ico('chevron-right', 14); s.append('Ver pilha');
    d.append(s, el('pre', '', g.pilha)); inn.append(d);
  }
  const ac = el('div', 'acoes');
  const br = el('button', g.resolvido ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'); br.type = 'button';
  br.innerHTML = ico(g.resolvido ? 'refresh' : 'check', 16); br.append(g.resolvido ? ' Reabrir' : ' Resolvido');
  br.addEventListener('click', () => acaoErro(br, async () => {
    await emLote(g.ids, (b, ref) => b.update(ref, { resolvido: !g.resolvido }));
    toast(g.resolvido ? 'Erro reaberto' : 'Marcado como resolvido');
  }));
  const bi = el('a', 'btn btn-secondary btn-sm'); bi.innerHTML = ico('link', 16); bi.append(' Issue');
  bi.href = C.linkIssue(g); bi.target = '_blank'; bi.rel = 'noopener noreferrer';
  bi.title = 'Abrir issue no GitHub (' + (C.REPOS[g.app] || 'CelsoAlmeidaLF/feedback-painel') + ')';
  const bc = el('button', 'btn btn-secondary btn-sm ic'); bc.type = 'button'; bc.setAttribute('aria-label', 'Copiar'); bc.innerHTML = ico('copy', 16);
  bc.addEventListener('click', async () => {
    const txt = `${C.nomeApp(g.app)} v${g.versao} · ${g.vezes}× · ${g.tipo}\n${g.mensagem}\n${g.origem}\n${g.pilha}\n${g.navegadores.join(', ')}`;
    try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch (_) { toast('Não foi possível copiar'); }
  });
  const bx = el('button', 'btn btn-danger btn-sm x'); bx.type = 'button'; bx.setAttribute('aria-label', `Excluir (${g.vezes})`);
  bx.innerHTML = ico('trash', 16) + '<span>Excluir?</span>';
  bx.addEventListener('click', () => {
    if (!bx.classList.contains('confirmar')) { bx.classList.add('confirmar'); setTimeout(() => bx.classList.remove('confirmar'), 4000); return; }
    c.classList.add('sai');
    setTimeout(() => { g.ids.forEach((id) => ocultos.add(id)); renderErros(); ilha(); }, 350);
    snack(g.vezes > 1 ? `Erro excluído (${g.vezes} ocorrências)` : 'Erro excluído',
      () => { g.ids.forEach((id) => ocultos.delete(id)); renderErros(); ilha(); },
      () => emLote(g.ids, (b, ref) => b.delete(ref)).then(() => g.ids.forEach((id) => ocultos.delete(id)))
        .catch(() => { g.ids.forEach((id) => ocultos.delete(id)); renderErros(); msg($('msgErros'), 'Não foi possível excluir. Verifique a conexão.', 'err'); }));
  });
  ac.append(br, bi, bc, bx); inn.append(ac); c.append(inn);
  return c;
}
// Firestore aceita até 500 operações por lote
async function emLote(ids, op) {
  for (let i = 0; i < ids.length; i += 450) {
    const b = writeBatch(db);
    ids.slice(i, i + 450).forEach((id) => op(b, doc(db, 'erros', id)));
    await b.commit();
  }
}
async function acaoErro(botao, fn) {
  botao.disabled = true;
  try { await fn(); msg($('msgErros'), ''); }
  catch (_) { botao.disabled = false; msg($('msgErros'), 'Não foi possível concluir. Verifique a conexão.', 'err'); }
}

// ═════ Filtros e visões ═════
const moverStatus = seletor($('fStatus'), (v) => { filtro.status = v; renderSugestoes(); });
const moverErro = seletor($('fErroStatus'), (v) => { filtroErro.status = v; renderListaErros(); });
$('fTipo').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  $('fTipo').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  filtro.tipo = b.dataset.v; renderSugestoes();
});
$('fApp').addEventListener('change', (e) => { filtro.app = e.target.value; renderSugestoes(); });
let tBusca;
$('fBusca').addEventListener('input', (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { filtro.busca = e.target.value; renderSugestoes(); }, 200); });
$('fErroApp').addEventListener('change', (e) => { filtroErro.app = e.target.value; $('fErroVersao').value = ''; renderErros(); });
$('fErroVersao').addEventListener('change', (e) => { filtroErro.versao = e.target.value; renderListaErros(); });
const moverVisao = seletor($('fVisao'), (v) => mostrar(v));
function mostrar(v) {
  $('visaoFeedback').hidden = v !== 'feedback'; $('visaoErros').hidden = v !== 'erros';
  if (v === 'erros') { renderErros(); requestAnimationFrame(moverErro); } else { if (carregou) renderFeedback(); requestAnimationFrame(moverStatus); }
}
function trocarVisao(v) { $('fVisao').querySelector(`[data-v="${v}"]`).click(); }

// ═════ Esqueleto enquanto o Firestore responde ═════
function esqueleto() {
  const a = $('listaApps'); a.replaceChildren();
  for (let i = 0; i < 2; i++) { const d = el('div', 'glass flat app-c'), e = el('div', 'esq'); e.style.height = '140px'; d.append(e); a.append(d); }
  const l = $('listaSug'); l.replaceChildren();
  for (let i = 0; i < 2; i++) { const d = el('div', 'glass flat msg-c'), n = el('div', 'inner'), e = el('div', 'esq'); e.style.height = '86px'; n.append(e); d.append(n); l.append(d); }
}
