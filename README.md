# Painel de feedback

Página para o dono dos apps ler as **avaliações** (estrelas) e **sugestões** enviadas pelo painel Apoiar · Avaliar · Sugerir de Câmbio, Cripto, Livro-Caixa e Taxômetro.

- Dados: Firestore do projeto `systekna-feedback` (regras em `FINANC/stk-pkg-doacao/firestore.rules`).
- Login por e-mail e senha (Firebase Auth). Só a conta cujo UID está na função `dono()` das regras lê, marca como lida e apaga sugestões.
- App Check com reCAPTCHA Enterprise (a mesma chave dos apps; domínio precisa estar na chave).
- Ao vivo (`onSnapshot`): mensagem nova aparece sem recarregar.
- Recursos: média e distribuição 1–5 por app, filtros (status, tipo, app, busca sem acento), responder por e-mail, marcar como lida, excluir (dois toques), exportar CSV (com proteção contra fórmula).
- Segurança: CSP rígida, texto dos usuários só via `textContent`, `noindex`, sem iframe.

## Estrutura

```
src/index.html      telas Entrar e Painel
src/app.js          Firebase (Auth, App Check, Firestore) e interface
src/painel-core.js  regras puras: resumo, filtros, CSV, datas (testadas)
src/painel.css      complementos do design system (financ-ui.css)
test/               node --test
```

## Rodar

```bash
npm test                                   # testes
cd src && python3 -m http.server 8780      # abrir http://localhost:8780 (localhost está na chave reCAPTCHA)
```

Publicação: GitHub Pages pelo workflow `.github/workflows/static.yml` (pasta `src`).
