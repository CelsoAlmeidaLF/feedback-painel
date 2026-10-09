# Painel de feedback

Página para o dono dos apps ler as **avaliações** (estrelas), as **sugestões** e os **relatórios de erro** enviados por Câmbio, Cripto, Livro-Caixa, Taxômetro e Investimentos.

- Dados: Firestore do projeto `systekna-feedback` (regras em `PACOTES/stk-pkg-doacao/firestore.rules`).
- Duas visões: **Feedback** (avaliações e sugestões) e **Erros** (relatórios do `stk-pkg-erros.js`, agrupados pelo mesmo erro, com contador, filtros por status, app e versão, pilha, copiar, marcar como resolvido e excluir).
- Login por e-mail e senha (Firebase Auth). Só a conta cujo UID está na função `dono()` das regras lê, marca como lida e apaga sugestões.
- App Check com reCAPTCHA Enterprise (a mesma chave dos apps; domínio precisa estar na chave).
- Ao vivo (`onSnapshot`): mensagem nova aparece sem recarregar.
- Recursos: média e distribuição 1–5 por app, filtros (status, tipo, app, busca sem acento), responder por e-mail, marcar como lida, excluir (dois toques), exportar CSV (com proteção contra fórmula).
- Segurança: CSP rígida, texto dos usuários só via `textContent`, `noindex`, sem iframe.

## Design Aero 3.0 (v1.3.0; "Pergunte ao painel" removido na v1.3.1)

Segue o template `PACOTES/stk-pkg-design-system/painel-feedback-aero3.html`: vidro com espessura, céu e luzes ao fundo, fonte Open Sans (servida em `src/fonts/`, SIL OFL 1.1).

- **Modo:** claro → escuro → luz ambiente (segue a hora: amanhecer, dia, entardecer, noite). Fica salvo neste navegador (`painel-modo`).
- **Ilha viva** no topo: mostra o que pede atenção agora (erro aberto nas últimas 24 h, depois sugestões novas).
- **Evolução da nota:** média semanal das últimas 8 semanas, por app ou geral, e tendência de 30 dias × 30 anteriores em cada app.
- **Gestos:** deslizar uma sugestão para a direita marca como lida; para a esquerda, exclui.
- **Desfazer:** excluir sugestão ou erro mostra "Desfazer" por 4,5 s; só então o documento é apagado no Firestore.
- **Erros:** botão **Issue** abre uma issue no repositório do app no GitHub com os dados técnicos.

## Cofre, PIN e biometria (v1.4.0)

O painel abre pelo kit de segurança (`PACOTES/stk-pkg-security`), como os outros apps:

- **Abrir:** PIN FINANC (o mesmo dos apps no endereço `celsoalmeidalf.github.io`) ou biometria. Sem desbloquear, nada aparece.
- **Entrar sozinho:** no primeiro login, com "Guardar e-mail e senha neste aparelho" marcado, a conta vai para o cofre (`secureStorage`, chave `painel:conta`), cifrado com AES-GCM por chave derivada do PIN (PBKDF2 600 mil) ou da biometria. Nos próximos desbloqueios o painel lê o cofre e entra no Firebase sem digitar nada.
- **Sessão do Firebase só na memória** (`inMemoryPersistence`): fechar a aba ou bloquear derruba o login. O token que as versões antigas guardavam sem cifra (`firebaseLocalStorageDb`) é apagado.
- **Menu ⋮ → Configurações:** PIN, senha no lugar do PIN, biometria, bloqueio automático e código de recuperação (do kit), mais a seção **Conta do painel**: e-mail e senha guardados (testa o login antes de salvar), trocar a senha da conta no Firebase (10+ caracteres; atualiza o cofre), esquecer e-mail e senha deste aparelho, sair da conta.
- **Risco aceito:** com o celular nas mãos, alguém pode tentar adivinhar o PIN de 6 números fora do app (horas, não anos). Para a senha do painel ficar mais protegida, use **Configurações → Usar senha em vez de PIN** com uma frase longa.

## Instalar no celular (v1.5.0)

O painel é um PWA: `manifest.json`, ícones Aero (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`) e `sw.js`, registrado pelo kit de segurança.

- **Android (Chrome):** menu ⋮ do painel → Configurações → **Instalar app**, ou menu do Chrome → **Instalar app** / "Adicionar à tela inicial".
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.
- O service worker busca **primeiro na rede**: versão nova vale na hora; sem internet, a tela abre do cache (os dados precisam de rede). Firebase e Google nunca passam pelo cache.
- Ao mudar arquivos do app, troque `data-vault-version` no `index.html` e `CACHE_NAME` no `sw.js` (o teste `pwa.test.js` confere).

## Estrutura

```
src/index.html      telas Entrar e Painel
src/app.js          Firebase (Auth, App Check, Firestore) e interface
src/painel-core.js  regras puras: resumo, filtros, CSV, datas, agrupamento de erros, tendência, médias semanais,
                    ilha e link de issue (testadas)
src/painel.css      design Aero 3.0 (tokens claro/escuro/luz ambiente e componentes)
src/fonts/          Open Sans variável + licença OFL
src/stk-pkg-*       kit de segurança e ícones (cópias de PACOTES/stk-pkg-security; não editar aqui)
test/               node --test
```

## Rodar

```bash
npm test                                   # testes
cd src && python3 -m http.server 8780      # abrir http://localhost:8780 (localhost está na chave reCAPTCHA)
```

Publicação: GitHub Pages pelo workflow `.github/workflows/static.yml` (pasta `src`).

Versão atual: **1.5.0** (`data-vault-version` no `index.html`), no ar só no DEV (`celsoalmeidalf.github.io/feedback-painel`). Situação em 09/10/2026: 26 testes passando. Para incluir um app novo, veja a lista de 4 lugares no README do `PACOTES/stk-pkg-doacao`.
