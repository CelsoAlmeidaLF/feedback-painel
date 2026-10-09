# Painel de feedback

Página para o dono dos apps ler as **avaliações** (estrelas), as **sugestões** e os **relatórios de erro** enviados por Câmbio, Cripto, Livro-Caixa, Taxômetro e Investimentos.

- Dados: Firestore do projeto `systekna-feedback` (regras em `PACOTES/stk-pkg-doacao/firestore.rules`).
- Duas visões: **Feedback** (avaliações e sugestões) e **Erros** (relatórios do `stk-pkg-erros.js`, agrupados pelo mesmo erro, com contador, filtros por status, app e versão, pilha, copiar, marcar como resolvido e excluir).
- Login por e-mail e senha (Firebase Auth). Só a conta cujo UID está na função `dono()` das regras lê, marca como lida e apaga sugestões.
- App Check com reCAPTCHA Enterprise (a mesma chave dos apps; domínio precisa estar na chave).
- Ao vivo (`onSnapshot`): mensagem nova aparece sem recarregar.
- Recursos: média e distribuição 1–5 por app, filtros (status, tipo, app, busca sem acento), responder por e-mail, marcar como lida, excluir (dois toques), exportar CSV (com proteção contra fórmula).
- Segurança: CSP rígida, texto dos usuários só via `textContent`, `noindex`, sem iframe.

## Design Aero 3.0 (v1.3.0)

Segue o template `PACOTES/stk-pkg-design-system/painel-feedback-aero3.html`: vidro com espessura, céu e luzes ao fundo, fonte Open Sans (servida em `src/fonts/`, SIL OFL 1.1).

- **Modo:** claro → escuro → luz ambiente (segue a hora: amanhecer, dia, entardecer, noite). Fica salvo neste navegador (`painel-modo`).
- **Ilha viva** no topo: mostra o que pede atenção agora (erro aberto nas últimas 24 h, depois sugestões novas).
- **Pergunte ao painel:** respostas calculadas com os dados já carregados, sem rede (pior e melhor nota, tendência, sugestões, erros). As respostas são montadas com `textContent`.
- **Evolução da nota:** média semanal das últimas 8 semanas, por app ou geral, e tendência de 30 dias × 30 anteriores em cada app.
- **Gestos:** deslizar uma sugestão para a direita marca como lida; para a esquerda, exclui.
- **Desfazer:** excluir sugestão ou erro mostra "Desfazer" por 4,5 s; só então o documento é apagado no Firestore.
- **Erros:** botão **Issue** abre uma issue no repositório do app no GitHub com os dados técnicos.

## Estrutura

```
src/index.html      telas Entrar e Painel
src/app.js          Firebase (Auth, App Check, Firestore) e interface
src/painel-core.js  regras puras: resumo, filtros, CSV, datas, agrupamento de erros, tendência, médias semanais,
                    ilha, "Pergunte ao painel", link de issue (testadas)
src/painel.css      design Aero 3.0 (tokens claro/escuro/luz ambiente e componentes)
src/fonts/          Open Sans variável + licença OFL
test/               node --test
```

## Rodar

```bash
npm test                                   # testes
cd src && python3 -m http.server 8780      # abrir http://localhost:8780 (localhost está na chave reCAPTCHA)
```

Publicação: GitHub Pages pelo workflow `.github/workflows/static.yml` (pasta `src`).

Versão atual: **1.3.0** (`data-version` no `index.html`), no ar só no DEV (`celsoalmeidalf.github.io/feedback-painel`). Situação em 09/10/2026: 19 testes passando. Para incluir um app novo, veja a lista de 4 lugares no README do `PACOTES/stk-pkg-doacao`.
