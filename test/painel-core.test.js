const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/painel-core.js');

const d = (s) => new Date(s);

test('resumo: média, total e distribuição por app e geral', () => {
  const r = C.resumo([
    { app: 'CAMBIO', nota: 5 }, { app: 'CAMBIO', nota: 4 }, { app: 'CAMBIO', nota: 3 },
    { app: 'TAXOMETRO', nota: 1 },
  ]);
  assert.equal(r.porApp.CAMBIO.total, 3);
  assert.equal(r.porApp.CAMBIO.media, 4);
  assert.deepEqual(r.porApp.CAMBIO.dist, [0, 0, 1, 1, 1]);
  assert.equal(r.porApp.TAXOMETRO.media, 1);
  assert.equal(r.porApp.CRIPTO.total, 0, 'app principal sem avaliação aparece zerado');
  assert.equal(r.porApp.DESPESAS, undefined, 'app fora dos principais só aparece com avaliação');
  assert.equal(r.geral.total, 4);
  assert.equal(r.geral.media, 13 / 4);
});

test('resumo: ignora nota inválida e inclui app fora da lista', () => {
  const r = C.resumo([{ app: 'X', nota: 5 }, { app: 'CAMBIO', nota: 6 }, { app: 'CAMBIO', nota: 2.5 }, { app: 'CAMBIO', nota: '5' }]);
  assert.equal(r.porApp.X.total, 1);
  assert.equal(r.porApp.CAMBIO.total, 0);
  assert.equal(r.geral.total, 1);
});

const sug = [
  { id: 'a', app: 'CRIPTO', tipo: 'problema', texto: 'Gráfico não carrega', lida: false, criadoEm: d('2026-10-01T10:00') },
  { id: 'b', app: 'CAMBIO', tipo: 'elogio', texto: 'Ótimo app', email: 'ana@ex.com', lida: true, criadoEm: d('2026-10-02T10:00') },
  { id: 'c', app: 'CRIPTO', tipo: 'sugestao', texto: 'Modo escuro', criadoEm: d('2026-09-30T10:00') },
];

test('filtrar: ordena da mais nova para a mais antiga', () => {
  assert.deepEqual(C.filtrar(sug).map((s) => s.id), ['b', 'a', 'c']);
});

test('filtrar: por app, tipo e status', () => {
  assert.deepEqual(C.filtrar(sug, { app: 'CRIPTO' }).map((s) => s.id), ['a', 'c']);
  assert.deepEqual(C.filtrar(sug, { tipo: 'elogio' }).map((s) => s.id), ['b']);
  assert.deepEqual(C.filtrar(sug, { status: 'novas' }).map((s) => s.id), ['a', 'c']);
  assert.deepEqual(C.filtrar(sug, { status: 'lidas' }).map((s) => s.id), ['b']);
});

test('filtrar: busca sem acento e sem diferença de maiúsculas, inclui e-mail', () => {
  assert.deepEqual(C.filtrar(sug, { busca: 'GRAFICO' }).map((s) => s.id), ['a']);
  assert.deepEqual(C.filtrar(sug, { busca: 'otimo' }).map((s) => s.id), ['b']);
  assert.deepEqual(C.filtrar(sug, { busca: 'ana@' }).map((s) => s.id), ['b']);
});

test('csv: BOM, separador ;, aspas e quebra de linha', () => {
  const out = C.csv([{ app: 'CAMBIO', tipo: 'problema', texto: 'linha 1\n"citado"; fim', criadoEm: d('2026-10-01T09:05') }]);
  assert.ok(out.startsWith('﻿data;app;tipo;status;email;mensagem\r\n'));
  assert.ok(out.includes('01/10/2026 09:05;Câmbio;Problema;nova;;"linha 1\n""citado""; fim"'));
});

test('csv: neutraliza fórmulas vindas do texto do usuário', () => {
  assert.equal(C.celula('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(C.celula('+1'), "'+1");
  assert.equal(C.celula('-2'), "'-2");
  assert.equal(C.celula('@SUM'), "'@SUM");
  assert.equal(C.celula('normal'), 'normal');
});

test('relativo: minutos, horas, ontem e data', () => {
  const agora = d('2026-10-05T12:00');
  assert.equal(C.relativo(d('2026-10-05T11:59:40'), agora), 'agora');
  assert.equal(C.relativo(d('2026-10-05T11:30'), agora), 'há 30 min');
  assert.equal(C.relativo(d('2026-10-05T07:00'), agora), 'há 5 h');
  assert.equal(C.relativo(d('2026-10-04T08:00'), agora), 'ontem');
  assert.equal(C.relativo(d('2026-09-20T08:00'), agora), '20/09/2026');
  assert.equal(C.relativo(null, agora), '');
});

test('linkResposta: só e-mail válido vira mailto, sem injeção de cabeçalho', () => {
  assert.equal(C.linkResposta({ app: 'CAMBIO', email: 'ana@ex.com' }), 'mailto:ana@ex.com?subject=Sobre%20sua%20mensagem%20no%20C%C3%A2mbio');
  assert.equal(C.linkResposta({ app: 'CAMBIO', email: 'x@y.com?cc=z@w.com&body=oi' }).includes('?cc='), false);
  assert.equal(C.linkResposta({ app: 'CAMBIO', email: 'javascript:alert(1)' }), '');
  assert.equal(C.linkResposta({ app: 'CAMBIO' }), '');
});

test('erros: agrupa pela assinatura, conta ocorrências e navegadores', () => {
  const erros = [
    { id: '1', assinatura: 'aaaa0001', app: 'CRIPTO', versao: '1.10.0', mensagem: 'x is not a function', navegador: 'Chrome 141 / Android', criadoEm: d('2026-10-08T10:00:00') },
    { id: '2', assinatura: 'aaaa0001', app: 'CRIPTO', versao: '1.10.0', mensagem: 'x is not a function', navegador: 'Safari 18 / iOS', criadoEm: d('2026-10-08T12:00:00') },
    { id: '3', assinatura: 'aaaa0001', app: 'CRIPTO', versao: '1.10.0', mensagem: 'x is not a function', navegador: 'Chrome 141 / Android', criadoEm: d('2026-10-07T09:00:00') },
    { id: '4', assinatura: 'bbbb0002', app: 'CAMBIO', versao: '1.10.0', mensagem: 'falhou', criadoEm: d('2026-10-08T11:00:00'), resolvido: true },
  ];
  const g = C.agruparErros(erros, { status: 'todos' });
  assert.equal(g.length, 2);
  assert.equal(g[0].assinatura, 'aaaa0001', 'mais recente primeiro');
  assert.equal(g[0].vezes, 3);
  assert.deepEqual(g[0].ids, ['1', '2', '3']);
  assert.deepEqual(g[0].navegadores, ['Chrome 141 / Android', 'Safari 18 / iOS']);
  assert.equal(g[0].ultimo.getTime(), d('2026-10-08T12:00:00').getTime());
  assert.equal(g[0].primeiro.getTime(), d('2026-10-07T09:00:00').getTime());
  assert.equal(g[1].resolvido, true);
});

test('erros: filtros de status, app e versão', () => {
  const erros = [
    { id: '1', assinatura: 'a', app: 'CRIPTO', versao: '1.10.0', criadoEm: d('2026-10-08') },
    { id: '2', assinatura: 'a', app: 'CRIPTO', versao: '1.10.0', criadoEm: d('2026-10-08'), resolvido: true },
    { id: '3', assinatura: 'b', app: 'CRIPTO', versao: '1.9.1', criadoEm: d('2026-10-08'), resolvido: true },
    { id: '4', assinatura: 'c', app: 'INVEST', versao: '1.0.0', criadoEm: d('2026-10-08') },
  ];
  assert.deepEqual(C.agruparErros(erros).map((g) => g.assinatura).sort(), ['a', 'c'], 'padrão: abertos (grupo com uma ocorrência aberta conta como aberto)');
  assert.deepEqual(C.agruparErros(erros, { status: 'resolvidos' }).map((g) => g.assinatura), ['b']);
  assert.deepEqual(C.agruparErros(erros, { status: 'todos', app: 'CRIPTO', versao: '1.9.1' }).map((g) => g.assinatura), ['b']);
  assert.deepEqual(C.agruparErros([], {}), []);
});

test('erros: versões em ordem decrescente numérica', () => {
  const erros = [{ app: 'CRIPTO', versao: '1.9.1' }, { app: 'CRIPTO', versao: '1.10.0' }, { app: 'CRIPTO', versao: '1.10.0' }, { app: 'CAMBIO', versao: '2.0.0' }, { app: 'CRIPTO', versao: '' }];
  assert.deepEqual(C.versoesErros(erros), ['2.0.0', '1.10.0', '1.9.1']);
  assert.deepEqual(C.versoesErros(erros, 'CRIPTO'), ['1.10.0', '1.9.1']);
});

test('apps: Investimentos tem nome e entra nos principais', () => {
  assert.equal(C.nomeApp('INVEST'), 'Investimentos');
  assert.ok(C.PRINCIPAIS.includes('INVEST'));
});

// ───────── Aero 3.0: tendência, gráfico, ilha ─────────
const AGORA = d('2026-10-09T12:00:00');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

test('tendência: 30 dias contra os 30 anteriores; sem base devolve null', () => {
  const sobe = [{ app: 'CAMBIO', nota: 3, criadoEm: diasAtras(40) }, { app: 'CAMBIO', nota: 5, criadoEm: diasAtras(5) }];
  assert.deepEqual(C.tendencia(sobe, AGORA), { cls: 'sobe', txt: '↑ +2,0', d: 2 });
  const desce = [{ nota: 5, criadoEm: diasAtras(45) }, { nota: 4, criadoEm: diasAtras(2) }];
  assert.equal(C.tendencia(desce, AGORA).cls, 'desce');
  assert.equal(C.tendencia(desce, AGORA).txt, '↓ −1,0');
  assert.equal(C.tendencia([{ nota: 4, criadoEm: diasAtras(40) }, { nota: 4, criadoEm: diasAtras(1) }], AGORA).cls, 'igual');
  assert.equal(C.tendencia([{ nota: 5, criadoEm: diasAtras(1) }], AGORA), null, 'sem período anterior');
  assert.equal(C.tendencia([{ nota: 5, criadoEm: diasAtras(70) }, { nota: 1, criadoEm: diasAtras(1) }], AGORA), null, 'mais de 60 dias não conta');
  assert.equal(C.tendencia([{ nota: 9, criadoEm: diasAtras(40) }, { nota: 5, criadoEm: diasAtras(1) }], AGORA), null, 'nota inválida é ignorada');
});

test('médias semanais: 8 semanas da mais antiga para a atual, null sem avaliação', () => {
  const lista = [
    { nota: 4, criadoEm: diasAtras(1) }, { nota: 2, criadoEm: diasAtras(3) },
    { nota: 5, criadoEm: diasAtras(50) }, { nota: 3, criadoEm: diasAtras(60) },
    { nota: 5, criadoEm: null },
  ];
  const s = C.mediasSemanais(lista, AGORA, 8);
  assert.equal(s.length, 8);
  assert.equal(s[7], 3, 'semana atual = (4 + 2) / 2');
  assert.equal(s[0], 5, 'dia 50 cai na semana mais antiga (dias 49 a 55); dia 60 fica fora das 8 semanas');
  assert.deepEqual(s.slice(1, 7), [null, null, null, null, null, null]);
});

test('ilha: erro aberto nas últimas 24 h vence sugestões novas', () => {
  const grupos = [{ app: 'CRIPTO', vezes: 3, mensagem: 'x'.repeat(200), ultimo: diasAtras(0.1), resolvido: false }];
  const sugs = [{ app: 'CAMBIO', lida: false, criadoEm: diasAtras(0.01) }];
  const e = C.destaque(sugs, grupos, AGORA);
  assert.equal(e.tipo, 'erro'); assert.equal(e.vezes, 3); assert.equal(e.mensagem.length, 90);
  const velho = [{ ...grupos[0], ultimo: diasAtras(2) }];
  assert.deepEqual(C.destaque([...sugs, { app: 'CRIPTO', lida: false, criadoEm: diasAtras(3) }], velho, AGORA),
    { tipo: 'sugestoes', total: 2, app: 'CAMBIO', quando: sugs[0].criadoEm });
  assert.deepEqual(C.destaque([{ lida: true }], [], AGORA), { tipo: 'em-dia' });
});

test('issue: link do GitHub com repositório do app e dados técnicos', () => {
  const g = { app: 'CRIPTO', versao: '1.11.1', vezes: 2, tipo: 'erro', mensagem: "TypeError: x is undefined", origem: 'js/app.js:10:5',
    pilha: 'at f (js/app.js:10:5)', navegadores: ['Chrome 141 / Android'], primeiro: d('2026-10-08T10:00:00'), ultimo: d('2026-10-09T09:30:00') };
  const u = new URL(C.linkIssue(g));
  assert.equal(u.origin + u.pathname, 'https://github.com/CelsoAlmeidaLF/cripto-sim/issues/new');
  assert.equal(u.searchParams.get('labels'), 'bug');
  assert.equal(u.searchParams.get('title'), '[Cripto v1.11.1] TypeError: x is undefined');
  assert.match(u.searchParams.get('body'), /\*\*Ocorrências:\*\* 2 \(primeira 08\/10\/2026 10:00, última 09\/10\/2026 09:30\)/);
  assert.match(u.searchParams.get('body'), /Chrome 141 \/ Android/);
  assert.match(C.linkIssue({ ...g, app: 'DESCONHECIDO' }), /^https:\/\/github\.com\/CelsoAlmeidaLF\/feedback-painel\//);
  assert.ok(C.linkIssue({ ...g, mensagem: 'm'.repeat(500) }).includes('title=' + encodeURIComponent('[Cripto v1.11.1] ' + 'm'.repeat(103))));
});

test('avatar: iniciais a partir do e-mail', () => {
  assert.equal(C.iniciais('celso.almeida@hotmail.com'), 'CA');
  assert.equal(C.iniciais('dono@x.com'), 'DO');
  assert.equal(C.iniciais(''), '?');
});

// ───────── Conta guardada no cofre ─────────
test('conta: grava e lê e-mail e senha no formato do cofre', () => {
  const t = C.gravarCredenciais('  dono@hotmail.com ', 'senha com espaço e "aspas"');
  assert.deepEqual(JSON.parse(t), { v: 1, email: 'dono@hotmail.com', senha: 'senha com espaço e "aspas"' });
  assert.deepEqual(C.lerCredenciais(t), { email: 'dono@hotmail.com', senha: 'senha com espaço e "aspas"' });
  assert.throws(() => C.gravarCredenciais('sem-arroba', 'x'), /E-mail inválido/);
  assert.throws(() => C.gravarCredenciais('a@b.co', ''), /Senha inválida/);
  assert.throws(() => C.gravarCredenciais('a@b.co', 'x'.repeat(257)), /Senha inválida/);
  assert.equal(C.CHAVE_CONTA, 'painel:conta');
});

test('conta: conteúdo fora do formato não vira login', () => {
  for (const ruim of [null, '', 'não é json', '{}', '[]', JSON.stringify({ v: 2, email: 'a@b.co', senha: 'x' }),
    JSON.stringify({ v: 1, email: 'invalido', senha: 'x' }), JSON.stringify({ v: 1, email: 'a@b.co', senha: '' }),
    JSON.stringify({ v: 1, email: 'a@b.co', senha: 5 })]) {
    assert.equal(C.lerCredenciais(ruim), null, String(ruim));
  }
});

test('conta: regras da senha nova', () => {
  assert.match(C.problemaSenhaNova('curta', 'curta', ''), /10 caracteres/);
  assert.match(C.problemaSenhaNova('x'.repeat(257), 'x'.repeat(257), ''), /256/);
  assert.match(C.problemaSenhaNova('senha-nova-1', 'senha-nova-2', ''), /não são iguais/);
  assert.match(C.problemaSenhaNova('mesma-senha-10', 'mesma-senha-10', 'mesma-senha-10'), /diferente da atual/);
  assert.equal(C.problemaSenhaNova('senha-nova-boa', 'senha-nova-boa', 'antiga-1234'), '');
});
