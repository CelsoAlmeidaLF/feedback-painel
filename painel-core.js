/**
 * painel-core.js — regras do painel de feedback, sem DOM nem Firebase.
 * Refatorado para Arquitetura Hexagonal, Orientação a Objetos e Criptografia.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PainelCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================
  // INFRASTRUCTURE LAYER
  // ==========================================
  class CryptoAdapter {
    static async encryptData(plainText, key) {
      const cryptoObj = typeof crypto !== 'undefined' ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
      if (!cryptoObj || !cryptoObj.subtle) throw new Error('Web Cryptography API não suportada');
      const iv = cryptoObj.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(plainText);
      const ciphertext = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoded);
      return { iv: Array.from(iv), cipher: Array.from(new Uint8Array(ciphertext)) };
    }

    static async decryptData(encryptedObj, key) {
      const cryptoObj = typeof crypto !== 'undefined' ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
      if (!cryptoObj || !cryptoObj.subtle) throw new Error('Web Cryptography API não suportada');
      const iv = new Uint8Array(encryptedObj.iv);
      const cipher = new Uint8Array(encryptedObj.cipher);
      const decrypted = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
      return new TextDecoder().decode(decrypted);
    }
  }

  // ==========================================
  // DOMAIN LAYER (Entities & Value Objects)
  // ==========================================
  
  class AppDictionary {
    constructor() {
      this._apps = {
        CAMBIO: 'Câmbio',
        CRIPTO: 'Cripto',
        LIVROCAIXA: 'Livro-Caixa',
        TAXOMETRO: 'Taxômetro',
        INVEST: 'Investimentos',
        DESPESAS: 'Despesas da Casa',
        LAUNCHER: 'Meus Apps'
      };
      this._tipos = { sugestao: 'Sugestão', problema: 'Problema', elogio: 'Elogio' };
      this._principais = ['CAMBIO', 'CRIPTO', 'LIVROCAIXA', 'TAXOMETRO', 'INVEST'];
    }

    get apps() { return this._apps; }
    get tipos() { return this._tipos; }
    get principais() { return this._principais; }

    getNomeApp(id) { return this._apps[id] || id; }
    getNomeTipo(t) { return this._tipos[t] || t; }
  }

  class Rating {
    constructor(data) {
      this._id = data.id;
      this._app = data.app;
      this._nota = data.nota;
      this._criadoEm = data.criadoEm;
    }
    get app() { return this._app; }
    get nota() { return this._nota; }
    isValid() { return Number.isInteger(this._nota) && this._nota >= 1 && this._nota <= 5; }
  }

  class Suggestion {
    constructor(data) {
      this._id = data.id;
      this._app = data.app;
      this._tipo = data.tipo;
      this._texto = data.texto || '';
      this._email = data.email || '';
      this._lida = !!data.lida;
      this._criadoEm = data.criadoEm;
    }
    
    get app() { return this._app; }
    get tipo() { return this._tipo; }
    get texto() { return this._texto; }
    get email() { return this._email; }
    get lida() { return this._lida; }
    get criadoEm() { return this._criadoEm; }
    
    isEmailValid() {
      return typeof this._email === 'string' && this._email.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this._email);
    }
  }

  // ==========================================
  // APPLICATION LAYER (Use Cases)
  // ==========================================
  class FeedbackService {
    constructor() {
      this._dictionary = new AppDictionary();
    }

    getResumo(avaliacoesRaw, appsList) {
      const apps = appsList || this._dictionary.principais;
      const vazio = () => ({ total: 0, soma: 0, media: 0, dist: [0, 0, 0, 0, 0] });
      const porApp = {};
      apps.forEach((a) => { porApp[a] = vazio(); });
      const geral = vazio();

      for (const item of avaliacoesRaw) {
        const r = new Rating(item);
        if (!r.isValid()) continue;
        
        if (!porApp[r.app]) porApp[r.app] = vazio();
        for (const bucket of [porApp[r.app], geral]) { 
          bucket.total++; 
          bucket.soma += r.nota; 
          bucket.dist[r.nota - 1]++; 
        }
      }
      for (const bucket of [...Object.values(porApp), geral]) {
        bucket.media = bucket.total ? bucket.soma / bucket.total : 0;
      }
      return { porApp, geral };
    }

    _removeAcentos(s) {
      return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    filtrarSugestoes(sugestoesRaw, filters) {
      const { app = '', tipo = '', status = 'todas', busca = '' } = filters || {};
      const termo = this._removeAcentos(busca.trim());
      const getTime = (d) => (d instanceof Date ? d.getTime() : 0);

      return sugestoesRaw
        .map(s => new Suggestion(s))
        .filter((s) => (!app || s.app === app)
          && (!tipo || s.tipo === tipo)
          && (status === 'todas' || (status === 'novas' ? !s.lida : !!s.lida))
          && (!termo || this._removeAcentos(`${s.texto} ${s.email}`).includes(termo)))
        .sort((a, b) => getTime(b.criadoEm) - getTime(a.criadoEm));
    }

    gerarCsv(sugestoes) {
      const formatCell = (v) => {
        let s = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };

      const linhas = [['data', 'app', 'tipo', 'status', 'email', 'mensagem']];
      for (const s of sugestoes) {
        linhas.push([
          this.formatarDataHora(s.criadoEm), 
          this._dictionary.getNomeApp(s.app), 
          this._dictionary.getNomeTipo(s.tipo), 
          s.lida ? 'lida' : 'nova', 
          s.email, 
          s.texto
        ]);
      }
      return '\uFEFF' + linhas.map((l) => l.map(formatCell).join(';')).join('\r\n') + '\r\n';
    }

    formatarDataHora(d) {
      if (!(d instanceof Date) || isNaN(d)) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    tempoRelativo(d, agora = new Date()) {
      if (!(d instanceof Date) || isNaN(d)) return '';
      const min = Math.floor((agora - d) / 60000);
      if (min < 1) return 'agora';
      if (min < 60) return `há ${min} min`;
      if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
      if (min < 48 * 60) return 'ontem';
      return this.formatarDataHora(d).slice(0, 10);
    }

    formatarMedia(n) {
      return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    gerarLinkResposta(sugestaoRaw) {
      const s = new Suggestion(sugestaoRaw);
      if (!s.isEmailValid()) return '';
      const assunto = `Sobre sua mensagem no ${this._dictionary.getNomeApp(s.app)}`;
      return `mailto:${encodeURIComponent(s.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(assunto)}`;
    }
  }

  // ==========================================
  // ERROS (relatórios técnicos do stk-pkg-erros.js)
  // ==========================================
  // Agrupa ocorrências pela assinatura (mesmo app + versão + mensagem + origem).
  // Um grupo está resolvido quando todas as ocorrências estão marcadas.
  function agruparErros(erros, filtros) {
    const { status = 'abertos', app = '', versao = '' } = filtros || {};
    const tempo = (d) => (d instanceof Date ? d.getTime() : 0);
    const grupos = new Map();
    for (const e of erros || []) {
      const chave = e.assinatura || e.id;
      let g = grupos.get(chave);
      if (!g) {
        g = { assinatura: chave, app: e.app, versao: e.versao || '', tipo: e.tipo, mensagem: e.mensagem || '', origem: e.origem || '',
          pilha: e.pilha || '', ids: [], vezes: 0, navegadores: [], primeiro: e.criadoEm || null, ultimo: e.criadoEm || null, abertos: 0 };
        grupos.set(chave, g);
      }
      g.ids.push(e.id); g.vezes++;
      if (!e.resolvido) g.abertos++;
      if (e.navegador && !g.navegadores.includes(e.navegador)) g.navegadores.push(e.navegador);
      if (!g.pilha && e.pilha) g.pilha = e.pilha;
      if (tempo(e.criadoEm) > tempo(g.ultimo)) g.ultimo = e.criadoEm;
      if (e.criadoEm && (!g.primeiro || tempo(e.criadoEm) < tempo(g.primeiro))) g.primeiro = e.criadoEm;
    }
    return [...grupos.values()]
      .map((g) => ({ ...g, resolvido: g.abertos === 0 }))
      .filter((g) => (!app || g.app === app) && (!versao || g.versao === versao)
        && (status === 'todos' || (status === 'abertos' ? !g.resolvido : g.resolvido)))
      .sort((a, b) => tempo(b.ultimo) - tempo(a.ultimo));
  }

  // Versões presentes, da mais nova para a mais antiga (comparação numérica por partes)
  function versoesErros(erros, app) {
    const vs = [...new Set((erros || []).filter((e) => !app || e.app === app).map((e) => e.versao).filter(Boolean))];
    const parte = (v) => v.split('.').map((n) => parseInt(n, 10) || 0);
    return vs.sort((a, b) => { const x = parte(a), y = parte(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0); } return 0; });
  }

  // ==========================================
  // VISÃO AERO 3.0: tendência, gráfico e ilha
  // ==========================================
  const DIA = 24 * 60 * 60 * 1000;
  const ms = (d) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : 0);
  const mediaDe = (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
  const notasValidas = (lista) => (lista || []).filter((a) => Number.isInteger(a.nota) && a.nota >= 1 && a.nota <= 5 && ms(a.criadoEm));

  // Média dos últimos 30 dias comparada aos 30 anteriores; null se faltar base em um dos períodos.
  function tendencia(avaliacoes, agora) {
    const ag = ms(agora) || Date.now(), lista = notasValidas(avaliacoes);
    const r = lista.filter((a) => ag - ms(a.criadoEm) < 30 * DIA).map((a) => a.nota);
    const p = lista.filter((a) => ag - ms(a.criadoEm) >= 30 * DIA && ag - ms(a.criadoEm) < 60 * DIA).map((a) => a.nota);
    if (!r.length || !p.length) return null;
    const d = mediaDe(r) - mediaDe(p);
    if (Math.abs(d) < 0.05) return { cls: 'igual', txt: '= estável', d };
    return { cls: d > 0 ? 'sobe' : 'desce', txt: (d > 0 ? '↑ +' : '↓ −') + service.formatarMedia(Math.abs(d)), d };
  }

  // Média de cada semana, da mais antiga (índice 0) à atual; null na semana sem avaliação.
  function mediasSemanais(avaliacoes, agora, semanas) {
    const ag = ms(agora) || Date.now(), n = semanas || 8, lista = notasValidas(avaliacoes), out = [];
    for (let w = n - 1; w >= 0; w--) {
      const ns = lista.filter((a) => { const idade = ag - ms(a.criadoEm); return idade >= w * 7 * DIA && idade < (w + 1) * 7 * DIA; }).map((a) => a.nota);
      out.push(ns.length ? mediaDe(ns) : null);
    }
    return out;
  }

  // O que a ilha viva destaca: erro aberto nas últimas 24 h > sugestões novas > tudo em dia.
  function destaque(sugestoes, grupos, agora) {
    const ag = ms(agora) || Date.now();
    const recentes = (grupos || []).filter((g) => !g.resolvido && ag - ms(g.ultimo) < DIA).sort((a, b) => ms(b.ultimo) - ms(a.ultimo));
    if (recentes.length) { const g = recentes[0]; return { tipo: 'erro', app: g.app, vezes: g.vezes, mensagem: String(g.mensagem || '').slice(0, 90), quando: g.ultimo }; }
    const novas = (sugestoes || []).filter((s) => !s.lida).sort((a, b) => ms(b.criadoEm) - ms(a.criadoEm));
    if (novas.length) return { tipo: 'sugestoes', total: novas.length, app: novas[0].app, quando: novas[0].criadoEm };
    return { tipo: 'em-dia' };
  }

  // Link para abrir issue no GitHub com os dados técnicos do grupo de erros.
  const REPOS = { CAMBIO: 'CelsoAlmeidaLF/cambio-sim', CRIPTO: 'CelsoAlmeidaLF/cripto-sim', LIVROCAIXA: 'CelsoAlmeidaLF/gerenc-fin', TAXOMETRO: 'CelsoAlmeidaLF/taxometro', INVEST: 'CelsoAlmeidaLF/invest-sim' };
  const TIPO_ERRO = { erro: 'Erro', promessa: 'Promessa', console: 'Console' };
  function linkIssue(g) {
    const nome = service._dictionary.getNomeApp(g.app);
    const titulo = `[${nome} v${g.versao || '?'}] ${g.mensagem || ''}`.slice(0, 120);
    const corpo = [
      `**App:** ${nome} v${g.versao || '?'}`,
      `**Ocorrências:** ${g.vezes} (primeira ${service.formatarDataHora(g.primeiro)}, última ${service.formatarDataHora(g.ultimo)})`,
      `**Tipo:** ${TIPO_ERRO[g.tipo] || g.tipo || 'Erro'}`,
      `**Origem:** \`${g.origem || '?'}\``,
      `**Navegadores:** ${(g.navegadores || []).join(', ')}`,
      '', '```', g.mensagem || '', g.pilha || '', '```', '', '_Aberta pelo painel de feedback._',
    ].join('\n');
    const repo = REPOS[g.app] || 'CelsoAlmeidaLF/feedback-painel';
    return `https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(corpo.slice(0, 6000))}`;
  }

  // Duas letras para o avatar, a partir do e-mail (ex.: celso.almeida@… → CA).
  function iniciais(email) {
    const partes = String(email || '').split('@')[0].split(/[._\-+]+/).filter(Boolean);
    const s = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] || '?').slice(0, 2);
    return s.toUpperCase();
  }

  // ==========================================
  // ADAPTER EXPORT (Mantendo assinatura legada)
  // ==========================================
  const service = new FeedbackService();
  const dict = service._dictionary;

  return {
    APPS: dict.apps,
    PRINCIPAIS: dict.principais,
    TIPOS: dict.tipos,
    nomeApp: id => dict.getNomeApp(id),
    nomeTipo: t => dict.getNomeTipo(t),
    resumo: (avaliacoes, apps) => service.getResumo(avaliacoes, apps),
    filtrar: (sugestoes, filters) => service.filtrarSugestoes(sugestoes, filters).map(s => ({
       id: s._id, app: s.app, tipo: s.tipo, texto: s.texto, email: s.email, lida: s.lida, criadoEm: s.criadoEm
    })),
    csv: sugestoes => service.gerarCsv(sugestoes),
    celula: v => {
        let s = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },
    dataHora: d => service.formatarDataHora(d),
    relativo: (d, a) => service.tempoRelativo(d, a),
    media: n => service.formatarMedia(n),
    emailValido: e => (new Suggestion({email: e})).isEmailValid(),
    linkResposta: s => service.gerarLinkResposta(s),
    agruparErros,
    versoesErros,
    tendencia,
    mediasSemanais,
    destaque,
    linkIssue,
    iniciais,
    REPOS,
    TIPO_ERRO,

    CryptoAdapter,
    FeedbackService,
    Suggestion,
    Rating,
    AppDictionary
  };
});
