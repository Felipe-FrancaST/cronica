# Atualização 032 — pagamentos por Pix

A atualização acrescenta **Pix com QR Code e copia e cola**, confirmação de pagamento e renovação manual. Se o banco já está na **031**, execute somente `supabase/migrations/202610190032_pix_payments.sql`, atualize os arquivos e faça **novo deploy na Vercel**. As migrações 001–031 foram preservadas. Veja [o guia completo do Pix](LEIA-ME-PIX.md).

A revisão anterior das consultas Mercado Pago e do diagnóstico `provider_400` continua incluída. Veja [o guia da conferência](LEIA-ME-CONFIRMACAO-PAGAMENTO.md).

## Correção 031 de exclusão, também incluída

A **031** corrige o erro `column "requested_by" does not exist` durante a exclusão de conta. Se você **já executou a 030**, aplique **somente** `supabase/migrations/202610180031_account_deletion_legacy_attribution.sql` no SQL Editor do Supabase. Depois volte a **Configurações → Continuar exclusão** e confirme a operação novamente. A correção SQL não exige novo deploy para funcionar com o código da 030.

Se o banco está na **029**, aplique primeiro a **030** e depois a **031**, em ordem. Não execute o `schema.sql` em seu banco existente. Consulte [o guia de conta e pagamentos](LEIA-ME-CONTA-E-PAGAMENTOS.md).

As migrações **001–030 foram preservadas**. A 031 atualiza somente a rotina de limpeza, sem excluir dados ao ser aplicada, e permite retomar as exclusões interrompidas. Planos, preços e regras de cobrança permanecem configurados como antes.

A 029 passa a exigir assinatura dos mestres existentes. Para uma transição gratuita, use a administração para conceder cortesias ou suspender a exigência. Credenciais reais e ativação de cobranças dependem da sua configuração. As funcionalidades da atualização 028 abaixo continuam incluídas.

Pilhas de tesouro, baús e outros objetos podem oferecer moedas nas cinco denominações da ficha e um item opcional. A coleta credita o conjunto uma única vez. O mestre também configura pistas escritas, recursos para recolher, permissões dos jogadores e mecanismos ligados a passagens ou luzes. Consulte [o guia de moedas e interações](LEIA-ME-MOEDAS-E-INTERACOES.md).

Os controles do mestre agora ficam em um menu com seis ferramentas. Abra somente o que precisa; **Ferramentas** ou Escape recolhe a ferramenta. Objetos têm abas de biblioteca, ajustes e peças no mapa; câmera e opções avançadas começam fechadas. As listas têm busca e paginação e usam a rolagem normal da página. Consulte [o guia do painel do mestre](LEIA-ME-PAINEL-DO-MESTRE.md).

As ações de cenário do mestre mostram o resultado imediatamente, confirmam só o elemento alterado e evitam o recarregamento completo da mesa. Durante o salvamento, os demais elementos continuam disponíveis; erros restauram o estado confirmado. A movimentação reutiliza os obstáculos quando muda apenas uma luz, e os modelos 3D são atualizados por região. Baús e portas continuam com as validações de chave, proximidade e coleta no servidor. Consulte [o guia de desempenho](LEIA-ME-DESEMPENHO-GRID.md).

## Painel recolhível e opções por toque, também incluídos

- **Interações do cenário** abre por **Cenário → Interações**. Use **Ferramentas** para recolher a lista. Os botões funcionam por clique, toque, Enter e Espaço; Escape fecha a ferramenta.
- **Com Editar grid ativo:** toque em um elemento para ver **Mover** e **Excluir**. Para mover, escolha a ação e toque na célula de destino. A prévia mostra a área ocupada; cancelar mantém a posição original.
- **Com a edição desativada:** toque no elemento e escolha **Interagir** para usar a ação disponível, como abrir uma passagem ou apagar uma luz. O mestre não precisa selecionar um personagem para essas ações de cenário.
- O movimento atualiza o mesmo elemento e preserva seus ajustes, conteúdo, chave e estado da recompensa. Destinos que ultrapassam o mapa são recusados. Durante o combate, as interações continuam disponíveis, e a edição do terreno permanece bloqueada.

As ferramentas específicas de pintura e visibilidade continuam disponíveis. Enquanto um pincel estiver ativo, o toque pinta ou coloca peças, inclusive sobre outros elementos; use **Parar de decorar** ou **Selecionar objeto** para voltar à seleção por toque. A seleção funciona nos modos 2D e 3D, inclusive no celular. Os jogadores mantêm as regras de proximidade, controle do personagem e uso da chave; as opções de edição são do mestre.

## Correção 027 dos recipientes, também incluída

Esta correção resolve `invalid input syntax for type timestamp with time zone: ""` ao colocar itens em baús e outros recipientes. O formulário agora envia somente os campos editáveis do elemento; a função no banco também ignora datas de criação/atualização recebidas dentro do objeto, inclusive de abas antigas. O banco continua gerando essas datas e verificando a versão antes de editar.

**Interações do cenário** agora organiza cada elemento em um cartão, com nome e posição acima das ações. Os nomes longos e os botões se ajustam à largura disponível, sem a barra de rolagem interna da lista.

## Atualizar o código

1. Use a pasta `rpg-cronica` deste ZIP e mantenha seu `.env.local` e as configurações do seu projeto.
2. Confira o suporte de banco conforme a seção abaixo.
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
4. Publique pelo processo habitual da Vercel e recarregue as abas dos participantes.

Na Vercel, a raiz do projeto é a pasta que contém `package.json`. Mantenha as variáveis de ambiente configuradas no projeto.

## Banco existente

Os caminhos históricos abaixo completam a base até a 031. **Depois aplique a 032** para habilitar o Pix. Se já está na 031, esta é a única migração necessária.

Para todos os caminhos abaixo, conclua a atualização aplicando as migrações ausentes até a **032** e seguindo a configuração de assinaturas. As migrações 001–030 foram preservadas.

Se a aplicação da 019 anterior retornou `42P13: cannot remove parameter defaults from existing function`, reexecute a 019 desta versão. Ela preserva os parâmetros padrão das funções já instaladas. Depois continue com os arquivos 020 e 021 deste ZIP. A reaplicação da 023 também foi corrigida para manter as restrições já existentes.

As otimizações visuais funcionam pela atualização do código. Os novos elementos e as interações precisam da migração 024. As migrações de reparo 019–021 da versão anterior continuam incluídas.

Se o banco está na **027**, aplique **028, 029, 030 e 031**. Se está na **026**, aplique **027, 028, 029, 030 e 031**, nessa ordem. A 027 corrige as datas vazias; a 028 amplia as recompensas e interações. A 028 preserva os itens, chaves, conteúdos e coletas existentes e pode ser reaplicada.

Se o banco está na **025**, aplique 026 a 031, em ordem. Se está na **024**, aplique 025 a 031. Se está na **023**, aplique 024 a 031. A migração 026 depende do catálogo e das versões de itens instalados pela 025.

Se faltarem migrações, aplique somente as ausentes, em ordem:

| Ordem | Arquivo                                                                         | Suporte                                                                                                           |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 019   | `supabase/migrations/202610070019_master_rules_and_scene_workshop.sql`          | Regras da campanha, rolagens persistentes de PV, catálogo e estilos do cenário.                                   |
| 020   | `supabase/migrations/202610070020_large_scenery_and_medieval_city.sql`          | Elementos de até 128 células e criação atômica da cidade.                                                         |
| 021   | `supabase/migrations/202610070021_grid_lighting_and_session_deletion.sql`       | Dia/noite, validação de luz e exclusão de capítulos pelo mestre.                                                  |
| 022   | `supabase/migrations/202610080022_grid_vision_rules.sql`                        | Visão dos personagens e configurações copiadas entre capítulos.                                                   |
| 023   | `supabase/migrations/202610080023_regional_darkness.sql`                        | Escuridão regional e preservação dessas áreas ao copiar mapas.                                                    |
| 024   | `supabase/migrations/202610130024_dungeon_scenery_and_interactions.sql`         | 16 peças de masmorra, variantes, nomes e interações seguras durante o combate.                                    |
| 025   | `supabase/migrations/202610130025_campaign_items.sql`                           | Catálogo da campanha, funções, bônus, versões, entregas e proteção de notas secretas.                             |
| 026   | `supabase/migrations/202610130026_scenery_lights_locks_and_loot.sql`            | Luzes, oito elementos, fechaduras, chaves automáticas, recompensas privadas e coleta segura.                      |
| 027   | `supabase/migrations/202610140027_scenery_container_timestamp_fix.sql`          | Corrige datas vazias ao salvar recipientes e mantém as datas sob controle do banco.                               |
| 028   | `supabase/migrations/202610140028_scenery_rewards_and_mechanisms.sql`           | Moedas na ficha, recompensas em mais objetos, pistas, permissões e mecanismos ligados a passagens ou luzes.       |
| 029   | `supabase/migrations/202610180029_subscriptions_and_site_admin.sql`             | Assinaturas Mercado Pago, planos, regras de cobrança e administração independente.                                |
| 030   | `supabase/migrations/202610180030_account_deletion_and_billing_reliability.sql` | Exclusão de conta, limpeza de arquivos e proteção da conciliação de pagamentos.                                   |
| 031   | `supabase/migrations/202610180031_account_deletion_legacy_attribution.sql`      | Corrige a exclusão em históricos com colunas de autoria de outra estrutura e permite retomar processos pendentes. |
| 032   | `supabase/migrations/202610190032_pix_payments.sql`                             | Pix com QR Code, confirmação segura, renovação manual, financeiro e compatibilidade com exclusão de conta.        |

Se já aplicou 022/023 sem ter recebido 019–021, restaure primeiro as ausentes de 019–021 e depois reaplique 022 e 023, nessa ordem. As funções de cópia da visão são atualizadas por esses arquivos; essa ordem mantém a versão mais recente. As migrações de reparo são repetíveis e não excluem dados ao serem aplicadas.

Esta consulta permite conferir a existência das principais operações que estavam faltando:

```sql
select
  to_regprocedure('public.save_campaign_rules_v19(uuid,jsonb,timestamptz)') is not null as regras_019,
  to_regprocedure('public.roll_character_hit_points(uuid,uuid,jsonb,uuid)') is not null as rolagens_019,
  to_regprocedure('public.create_battle_scene(uuid,jsonb,jsonb,uuid)') is not null as cidade_020,
  to_regprocedure('public.delete_campaign_session(uuid,timestamptz)') is not null as exclusao_021,
  to_regprocedure('public.set_battle_scenery_state(uuid,text,timestamptz)') is not null as interacoes_024,
  to_regprocedure('public.save_campaign_item(jsonb,integer)') is not null as itens_025,
  to_regprocedure('public.give_campaign_item(uuid,uuid,integer,uuid,integer)') is not null as entregas_025,
  to_regprocedure('public.save_scenery_element(jsonb,jsonb,timestamptz)') is not null as elementos_026,
  to_regprocedure('public.interact_scenery(uuid,uuid,text,uuid,timestamptz,uuid)') is not null as interacoes_026,
  to_regprocedure('public.set_scenery_mechanism_state(uuid,text,timestamptz)') is not null as mecanismos_028,
  to_regclass('public.scenery_reward_claims') is not null as recompensas_028,
  to_regprocedure('public.get_billing_context()') is not null as assinaturas_029,
  to_regprocedure('public.site_admin_read(text,jsonb)') is not null as administracao_029,
  to_regprocedure('public.account_deletion_preview()') is not null as exclusao_conta_030;
```

Um resultado `false` indica que a operação correspondente ainda precisa ser instalada. O `supabase/schema.sql` foi atualizado para uma instalação nova; em um banco existente, use as migrações individuais conforme a ordem acima.

A operação de salvamento mantém a mesma assinatura da 026; a consulta acima não distingue sua versão corrigida. Mesmo que `elementos_026` retorne `true`, aplique as migrações ausentes **027, 028, 029, 030 e 031**, nessa ordem.

As configurações de visão noturna, escuridão regional, movimento sem visão e exibição completa do personagem continuam disponíveis.

Consulte [o guia das luzes, baús e chaves](LEIA-ME-LUZES-BAUS-E-CHAVES.md), [o guia dos itens](LEIA-ME-ITENS-DA-CAMPANHA.md) e [o guia do Grid](LEIA-ME-FLUIDEZ-E-MASMORRAS.md). O [relatório anterior de estabilidade](LEIA-ME-CORRECOES-GRID-3D.md) permanece como referência.
