# Atualização 049 — Arkanis: PV, aptidões e poções

## Instalação

1. Preserve suas variáveis de ambiente e faça backup do projeto e banco.
2. Substitua o código pela pasta `cronica` deste ZIP.
3. Para banco já na versão 048, aplique **somente** `supabase/migrations/202611050049_arkanis_potions_and_progression.sql` no SQL Editor do Supabase. Para versões anteriores, aplique as migrações ausentes em ordem. Não execute `schema.sql` em banco existente.
4. Com Node.js 22 ou superior, execute `npm ci`, `npm run typecheck` e `npm run build`.
5. Publique pelo processo habitual e recarregue o site.

Banco novo: aplique todas as migrações em ordem ou `supabase/schema.sql`, que já inclui a 049. Não use os dois caminhos juntos.

## O que mudou

- Aptidões raciais ativadas ao escolher a raça: Humano/Lógico básico, Anão/Mecânico básico, Harpia/Percepção avançada e Demônio/Intimidação avançada. Níveis 1, 2 e 3 equivalem a Básico, Avançado e Mestre. O mínimo racial não pode ser reduzido e trocar de raça conserva o treinamento adicional, sem acumular concessões raciais.
- HP passa a se chamar PV nas telas de Arkanis. Os nomes internos do banco são preservados para manter compatibilidade.
- Em Regras/Permissões de Arkanis, o mestre escolhe dado cheio ou rolagem por nível. Cada nível soma o dado racial e o modificador de Resistência final. Orcs somam a Resistência final inteira por nível, mantendo o bônus fixo preexistente de +8 PV uma única vez.
- Rolagens de PV ficam registradas por raça e nível; diminuir o nível e aumentá-lo novamente não gera novas rolagens. No modo rolado, use “Rolar PV dos níveis pendentes”.
- Fichas antigas adotam o cálculo ao serem abertas e salvas. Após mudar a regra da campanha, reabra e salve as fichas para atualizar os máximos armazenados; os PV atuais são limitados ao novo máximo. Não há cura automática.
- O mestre encontra “Dar itens” em cada cartão de personagem. Escolha um item ativo cadastrado na campanha e a quantidade. A entrega usa o mesmo histórico, permissões e proteção contra duplicação do fluxo existente.
- Alquimia contém as 75 receitas fornecidas: 30 básicas, 30 aprimoradas e 15 superiores, todas com ícones locais de frascos.
- Arraste ingredientes da bolsa para os dois espaços, toque nos materiais ou selecione-os nos campos. A prévia mostra efeito, duração e uso. O livro de receitas possui busca e seleção rápida.
- Cada preparo consome uma unidade de cada material e cria uma poção. Poções também podem alimentar receitas avançadas. Salvar a ficha confirma inventário e resultado na mesma transação; sair sem salvar não os confirma. Combinações inexistentes e materiais insuficientes não são consumidos.
- Efeitos, testes contra alvos e aplicação das poções são descritos integralmente e resolvidos pela mesa; não foram inventados custos, CDs de fabricação, tempo de preparo nem testes de sucesso.
- Layout adaptado à largura real do modal, com campos alinhados, colunas flexíveis e alternativa de seleção por toque/teclado para o arraste.

## Conferir o banco

```sql
select count(*) from public.arkanis_potions; -- 75
select count(*) from public.arkanis_ingredients; -- 180
```

Veja `VALIDACAO-049.md` para a validação desta entrega. Os documentos numerados anteriores descrevem suas respectivas versões. Para configuração de autenticação, armazenamento, pagamentos e manutenção, seguem válidos os guias anteriores incluídos.
