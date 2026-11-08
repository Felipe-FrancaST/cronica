# Alterações 052

- Nova rota POST `/api/characters/save`, com sessão por cookie, validação de origem e entrada limitada a 2 MiB.
- Transporte da ficha Arkanis pelo servidor do site; mesma função SQL e mesma identidade do usuário.
- Resposta sem cache contendo versão confirmada, ou erro com etapa, código e referência.
- Limite do servidor de 25 segundos e do cliente de 35 segundos, sem repetição automática. O proxy delega a autenticação desta rota ao próprio handler, evitando uma espera anterior sem diagnóstico.
- `serverSupabase` aceita sinal de cancelamento opcional, preservando o comportamento das rotas existentes.
- Testes de confirmação, sessão, origem, conflito, permissão, cancelamento e fluxo de navegador com o transporte direto ao Supabase bloqueado.
- Sem novas migrações SQL; interface e regras anteriores mantidas.
