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
