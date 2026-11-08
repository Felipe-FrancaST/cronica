# Validação 052

- 40 testes automatizados distintos aprovados: Arkanis/regras/banco, limites de espera e handler de salvamento. Incluem sessão ausente, origem diferente, origem pública atrás de proxy, conflito de versão, permissão e demora nas etapas de sessão e banco.
- Banco dos testes: PostgreSQL via PGlite. Sem acesso ao banco de produção.
- Dois fluxos de navegador aprovados, em 1440 px e 375 px, com a chamada direta do navegador a save_arkanis_character bloqueada. Salvamento pelo servidor, retrato com recorte, reabertura da ficha, alquimia e entregas persistiram.
- Testes de atraso do endpoint e de recarga posterior mantidos: preservação do rascunho e liberação do formulário verificadas.
- TypeScript, formatação dos arquivos alterados, git diff --check e build de produção aprovados. A rota /api/characters/save consta no build.
- A captura enviada não identificou a causa raiz do problema em produção. Esta entrega altera o transporte e acrescenta diagnóstico por etapa. O resultado no site publicado deve ser confirmado após o deploy.

Comandos: testes Node/tsx de tests/character-save-handler.test.ts, tests/async-operation.test.ts e tests/arkanis*.test.ts; Playwright com playwright.arkanis.config.ts, filtro Arkanis .*px; typecheck; build.
