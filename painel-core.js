/* painel-core.js — regras do painel de feedback, sem DOM nem Firebase (testável com node --test).
   Avaliação: { id, app, nota (1–5), criadoEm: Date }
   Sugestão:  { id, app, tipo, texto, email?, lida?, criadoEm: Date } */
(function (root) {
  'use strict';

  const APPS = {
    CAMBIO: 'Câmbio',
    CRIPTO: 'Cripto',
    LIVROCAIXA: 'Livro-Caixa',
    TAXOMETRO: 'Taxômetro',
    DESPESAS: 'Despesas da Casa',
    LAUNCHER: 'Meus Apps',
  };
  const TIPOS = { sugestao: 'Sugestão', problema: 'Problema', elogio: 'Elogio' };

  const nomeApp = (id) => APPS[id] || id;
  const nomeTipo = (t) => TIPOS[t] || t;

  // Média, total e distribuição 1–5 por app, mais o geral. Apps sem avaliação também aparecem.
  function resumo(avaliacoes, apps = Object.keys(APPS)) {
    const vazio = () => ({ total: 0, soma: 0, media: 0, dist: [0, 0, 0, 0, 0] });
    const porApp = {};
    apps.forEach((a) => { porApp[a] = vazio(); });
    const geral = vazio();
    for (const { app, nota } of avaliacoes) {
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) continue;
      if (!porApp[app]) porApp[app] = vazio();
      for (const r of [porApp[app], geral]) { r.total++; r.soma += nota; r.dist[nota - 1]++; }
    }
    for (const r of [...Object.values(porApp), geral]) r.media = r.total ? r.soma / r.total : 0;
    return { porApp, geral };
  }

  const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // filtro: { app: '' | id, tipo: '' | tipo, status: 'todas' | 'novas' | 'lidas', busca: texto }
  function filtrar(sugestoes, { app = '', tipo = '', status = 'todas', busca = '' } = {}) {
    const termo = semAcento(busca.trim());
    return sugestoes
      .filter((s) => (!app || s.app === app)
        && (!tipo || s.tipo === tipo)
        && (status === 'todas' || (status === 'novas' ? !s.lida : !!s.lida))
        && (!termo || semAcento(`${s.texto} ${s.email || ''}`).includes(termo)))
      .sort((a, b) => tempo(b.criadoEm) - tempo(a.criadoEm));
  }
  const tempo = (d) => (d instanceof Date ? d.getTime() : 0);

  // CSV para planilha (separador ;, BOM UTF-8). Células que começam com = + - @ ganham ' na frente
  // para a planilha não executar fórmula vinda de texto enviado por terceiros.
  function celula(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(sugestoes) {
    const linhas = [['data', 'app', 'tipo', 'status', 'email', 'mensagem']];
    for (const s of sugestoes) {
      linhas.push([dataHora(s.criadoEm), nomeApp(s.app), nomeTipo(s.tipo), s.lida ? 'lida' : 'nova', s.email || '', s.texto]);
    }
    return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
  }

  function dataHora(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // "há 5 min", "há 3 h", "ontem", senão a data
  function relativo(d, agora = new Date()) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const min = Math.floor((agora - d) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
    if (min < 48 * 60) return 'ontem';
    return dataHora(d).slice(0, 10);
  }

  const media = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Só e-mails no formato aceito pelas regras viram link mailto
  const emailValido = (e) => typeof e === 'string' && e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  function linkResposta(s) {
    if (!emailValido(s.email)) return '';
    const assunto = `Sobre sua mensagem no ${nomeApp(s.app)}`;
    return `mailto:${encodeURIComponent(s.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(assunto)}`;
  }

  const api = { APPS, TIPOS, nomeApp, nomeTipo, resumo, filtrar, csv, celula, dataHora, relativo, media, emailValido, linkResposta };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PainelCore = api;
})(typeof self !== 'undefined' ? self : this);
