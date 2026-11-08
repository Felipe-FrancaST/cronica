# Atualização 050 — Ficha, laboratório e catálogo de entregas

## Atualizar o projeto

1. Preserve as variáveis de ambiente e faça backup do banco.
2. Substitua o código pela pasta `cronica` deste ZIP.
3. Em banco já na versão 049, aplique apenas `supabase/migrations/202611070050_arkanis_catalog_deliveries.sql` no SQL Editor do Supabase. Se o banco ainda estiver na 048, aplique a 049 e depois a 050. Nunca execute `schema.sql` em banco existente.
4. Com Node.js 22 ou superior, execute `npm ci`, `npm run typecheck` e `npm run build`.
5. Publique pelo seu processo habitual e recarregue as abas abertas.

Para banco novo, use todas as migrações em ordem ou `supabase/schema.sql`, que já inclui a 050.

## Ficha de Arkanis

- A navegação lateral foi substituída por atalhos compactos com ícones e nomes curtos: Identidade, Essência, Aptidões, Arsenal, Grimório, Bolsa e Alquimia. No celular, os atalhos se organizam em duas linhas, sem exigir rolagem lateral.
- O retrato aparece ao lado do nome. Clique ou toque nele para escolher outra imagem, ajustar o recorte e visualizar o resultado. Salve a ficha para confirmar a troca.
- A foto só pode ser alterada por quem tem permissão para editar a ficha.
- Aptidões raciais, PV e demais regras da atualização 049 continuam funcionando.

## Laboratório

- Bolsa de materiais com busca, quantidade disponível e arraste para dois espaços de mistura. Também é possível tocar no material ou selecioná-lo diretamente em cada espaço.
- A mistura exibe uma prévia com ícone, efeito, duração e uso. Após preparar, o resultado permanece visível como confirmação de que foi adicionado à bolsa.
- Livro das 75 receitas com busca por nome, efeito ou ingredientes e filtro por nível. Cada receita indica quando os materiais necessários estão disponíveis.
- O catálogo dos 180 ingredientes permanece abaixo da bancada, em uma seção recolhível, com busca e habitats.
- O preparo usa uma unidade de cada material e produz uma poção. Salve a ficha para confirmar consumo e resultado. Efeitos no jogo continuam sob resolução da mesa.

## Dar itens — mestre

No cartão do personagem, abra **Dar itens** e escolha:

- **Ingredientes**: todos os 180 materiais, sem cadastro prévio. Busque pelo nome ou afinidade e filtre pelas 18 localidades.
- **Poções**: todas as 75 poções prontas. Busque pelo nome, efeito ou ingredientes da receita e filtre pelo nível. Poções não recebem uma localidade inventada.
- **Da campanha**: os itens personalizados que já foram cadastrados.

Clique em um item para consultar os detalhes, escolha a quantidade e confirme a entrega. A criação do modelo de catálogo e sua entrega são feitas na mesma transação, com o histórico existente e proteção contra repetição de uma mesma solicitação. O catálogo da campanha só recebe os modelos efetivamente entregues. Somente o mestre da campanha pode realizar a operação.

A migração 050 é necessária para entregar diretamente ingredientes e poções do catálogo.

Veja `VALIDACAO-050.md` para os testes desta entrega. Os documentos numerados anteriores descrevem as versões correspondentes.
