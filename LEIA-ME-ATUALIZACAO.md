# Atualização: estabilidade do Grid 3D e reparo das migrações

## Atualizar o código

1. Use a pasta `cronica-rpg` deste ZIP e mantenha as configurações do seu projeto.
2. Confira o suporte de banco conforme a seção abaixo.
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
4. Publique pelo processo habitual da Vercel e recarregue as abas dos participantes.

Na Vercel, a raiz do projeto é a pasta que contém `package.json`. Mantenha as variáveis de ambiente configuradas no projeto.

## Banco existente

Se a aplicação da 019 anterior retornou `42P13: cannot remove parameter defaults from existing function`, reexecute a 019 desta versão. Ela preserva os parâmetros padrão das funções já instaladas. Depois continue com os arquivos 020 e 021 deste ZIP. A reaplicação da 023 também foi corrigida para manter as restrições já existentes.

As correções visuais funcionam pela atualização do código. O ZIP recebido, porém, não incluía as migrações 019, 020 e 021, embora as telas e os testes dependessem delas. Este pacote inclui essas migrações completas.

Se você já aplicou as migrações de 019 a 023, não precisa executar SQL para receber as correções visuais.

Se faltarem migrações, aplique somente as ausentes, em ordem:

| Ordem | Arquivo                                                                   | Suporte                                                                         |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 019   | `supabase/migrations/202610070019_master_rules_and_scene_workshop.sql`    | Regras da campanha, rolagens persistentes de PV, catálogo e estilos do cenário. |
| 020   | `supabase/migrations/202610070020_large_scenery_and_medieval_city.sql`    | Elementos de até 128 células e criação atômica da cidade.                       |
| 021   | `supabase/migrations/202610070021_grid_lighting_and_session_deletion.sql` | Dia/noite, validação de luz e exclusão de capítulos pelo mestre.                |
| 022   | `supabase/migrations/202610080022_grid_vision_rules.sql`                  | Visão dos personagens e configurações copiadas entre capítulos.                 |
| 023   | `supabase/migrations/202610080023_regional_darkness.sql`                  | Escuridão regional e preservação dessas áreas ao copiar mapas.                  |

Se já aplicou 022/023 sem ter recebido 019–021, restaure primeiro as ausentes de 019–021 e depois reaplique 022 e 023, nessa ordem. As funções de cópia da visão são atualizadas por esses arquivos; essa ordem mantém a versão mais recente. As migrações de reparo são repetíveis e não excluem dados ao serem aplicadas.

Esta consulta permite conferir a existência das principais operações que estavam faltando:

```sql
select
  to_regprocedure('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)') is not null as regras_019,
  to_regprocedure('public.roll_character_hit_points(uuid,uuid,jsonb,uuid)') is not null as rolagens_019,
  to_regprocedure('public.create_battle_scene(uuid,jsonb,jsonb,uuid)') is not null as cidade_020,
  to_regprocedure('public.delete_campaign_session(uuid,timestamptz)') is not null as exclusao_021;
```

Um resultado `false` indica que a operação correspondente ainda precisa ser instalada. O `supabase/schema.sql` foi atualizado para uma instalação nova; em um banco existente, use as migrações individuais conforme a ordem acima.

As configurações de visão noturna, escuridão regional, movimento sem visão e exibição completa do personagem continuam disponíveis.

Consulte [o relatório das correções e validações](LEIA-ME-CORRECOES-GRID-3D.md).
