# Verificação da entrega v15

- `npm test`: **131 testes aprovados**, sem falhas. Inclui migração de uma Mesa v14 em PostgreSQL via PGlite, RLS, arquivo e cópia de cenários, mortes, recursos de magia e bloqueios das fichas.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado, com compilação de produção do Next.js e geração das rotas.
- Navegador: **47 fluxos distintos verificados** entre a regressão da Mesa e os novos fluxos de sessões/regras. A rodada completa em desenvolvimento passou 44 de 46; dois casos apresentaram problemas de navegação do ambiente de desenvolvimento e foram repetidos no build de produção. A rodada final de produção passou **9 de 9**, incluindo esses dois casos e a nova verificação de redimensionamento dos dados.

Os testes de navegador usam uma API local controlada, sem tocar no Supabase da campanha. Os testes de banco executam as migrações e as permissões em PostgreSQL via PGlite, com usuários de mestre, jogador e terceiro. A entrega não foi publicada no seu domínio nem aplicada ao seu banco real.

## Casos conferidos

- Criação com nome, número único, data automática, erro visível no editor e uma única sessão ativa.
- Preparação privada, início, registro automático, anotações, imagens e consulta por jogadores.
- Morte confirmada, distinção entre morte e queda a 0 PV, registros privados de NPCs ocultos e ausência de duplicação nas confirmações sequenciais.
- Encerramento de combates e pendências, remoção de peças e manutenção das fichas, cenários e histórico.
- Arquivo somente para consulta, proteção das imagens e cópia independente de estruturas/Mural.
- Códigos de portais limitados à sessão, sem conexão acidental com capítulos antigos.
- Nível do grupo, bloqueio pela interface e API, ajuste de recursos ao reduzir nível e preservação da edição de fichas existentes quando apenas novas criações estão bloqueadas.
- Imagens de mapa, movimento/água, magias, dano/cura, aprovação, dados, fichas de NPCs, variantes, pincéis, áreas ocultas e navegação em celular.
- Correção de raio negativo na animação dos dados quando um painel mede 1 pixel durante uma transição.

As 15 migrações anteriores foram comparadas byte a byte com o ZIP v14 e permanecem idênticas. O arquivo `supabase/schema.sql` foi regenerado a partir das 16 migrações. O manifesto `arquivos-alterados-v15.json` registra os arquivos e seus hashes em relação à versão anterior.
