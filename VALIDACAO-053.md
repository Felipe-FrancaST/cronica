# Validação 053

- Suíte completa: 643 testes aprovados, sem falhas. Execução com Node/tsx e concorrência 2; usado --no-wasm-tier-up para contornar uma falha do runtime V8/WASM local durante testes PGlite.
- Dois fluxos de navegador aprovados: 1440 px e 375 px. A regra de PV muda enquanto a ficha está aberta; salvar retorna HTTP 409 / PT409, o editor atualiza a regra, o jogador rola os PV pendentes e consegue salvar.
- Regressão PostgreSQL via PGlite verifica PT409 em conflito de PV e versão desatualizada, ausência de gravação após falha, preservação de ACL/proprietário/SECURITY DEFINER e reaplicação da migração.
- TypeScript, git diff --check e build de produção aprovados.
- A migração corrige os códigos explícitos das 34 funções listadas. A suíte verifica que não restam atribuições explícitas ERRCODE=40001 nas funções do projeto carregadas por todas as migrações.
- O PostgREST 14 de produção não foi executado localmente. O comportamento de repetição de 40001 foi identificado a partir do erro e da versão enviados pelo usuário, com confirmação na documentação oficial do Supabase.
- Nenhuma alteração foi aplicada ao Supabase ou à hospedagem de produção do usuário. É necessário executar a migração 053 e publicar o código conforme LEIA-ME-ATUALIZACAO.md.

Comandos: node --no-wasm-tier-up --import tsx --test --test-concurrency=2 tests/*.test.ts; Playwright com playwright.arkanis.config.ts e filtro Arkanis .*px; typecheck; build.
