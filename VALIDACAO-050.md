# Validação da versão 050

- 41 testes automatizados de Arkanis e itens de campanha aprovados, incluindo catálogo completo, entrega, autorização, idempotência e reaplicação da migração.
- Testes de navegador aprovados em 1440 px e 375 px: criação e reabertura de ficha, retrato escolhido e recortado, preparo de poção, entrega de ingrediente com busca/localidade e entrega de poção com busca/nível. Quantidades persistidas verificadas.
- TypeScript sem erros e build de produção Next.js concluído.
- Revisão visual da ficha, laboratório e entrega em computador e celular.
- Banco dos testes: PostgreSQL via PGlite. Nenhuma migração foi executada no banco de produção do usuário.
- Aplique a migração 050 conforme LEIA-ME-ATUALIZACAO.md antes de usar as entregas do catálogo em produção.
