# Validação 049

- TypeScript: aprovado (`tsc --noEmit`).
- Build de produção Next.js: aprovado, com todas as rotas compiladas.
- 52 testes unitários e de PostgreSQL/PGlite aprovados: Arkanis, receitas, progressão de PV, itens de campanha, entregas e regras do mestre.
- Todas as 75 receitas conferidas contra o catálogo, com duas entradas resolvidas, efeito/duração/uso preservados e ícone local existente. Testado preparo em ordem invertida, consumo, estoque insuficiente e ausência de mutação em caso de erro.
- Testado no PostgreSQL local: salvar PV de orc, preservar rolagens anteriores, ativar aptidão de harpia, persistir poção com criação de itens personalizados desabilitada, permissões, concorrência, entrega e reaplicação da migração.
- Dois testes Playwright aprovados em 1440 px e 375 px: troca de raça/aptidão, criação de ficha, catálogo de ingredientes, preparo de poção, inventário, salvamento, reabertura, diálogo Dar itens, ausência de erros JavaScript e de transbordamento horizontal do modal.
- Capturas de computador e celular inspecionadas. Elas não integram o ZIP.
- `git diff --check`: aprovado.

Os testes foram locais e não acessaram o banco de produção. Aplicar a migração 049 no Supabase continua sendo parte da instalação. Efeitos de combate das poções são apresentados para resolução pela mesa; não são aplicados automaticamente.
