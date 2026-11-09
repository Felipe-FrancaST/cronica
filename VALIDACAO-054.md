# Validação 054

- 38 testes de banco/regras Arkanis, conflitos e handler de salvamento aprovados.
- Regressão 054: criação de campanha autenticada já grava maximum; primeira ficha salva sem configuração manual; migração corrige ausência de regras e average legado, preserva todas as colunas de campanhas rolled e D&D e pode ser reaplicada.
- Dois fluxos de navegador aprovados, em 1440 px e 375 px. Verificado o registro maximum logo após criar a campanha, seguido da criação/salvamento/reabertura de ficha, retrato, alquimia e entrega de itens. Mantido teste de mudança real de regra durante a edição e resolução do conflito.
- TypeScript, formatação dos arquivos alterados, git diff --check e build de produção aprovados.
- PostgreSQL dos testes via PGlite; nenhuma alteração foi aplicada ao banco de produção do usuário.

Comandos: node --no-wasm-tier-up --import tsx --test --test-concurrency=2 tests/arkanis*.test.ts tests/business-conflicts.test.ts tests/character-save-handler.test.ts; Playwright com playwright.arkanis.config.ts e filtro Arkanis .*px; typecheck; build.
