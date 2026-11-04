# Crônica 047 — alterações implementadas

Base: `cronica(2).zip`, atualização 046. Esta entrega mantém as funcionalidades e as migrações anteriores e concentra as mudanças novas no código indicado abaixo e na migração 047.

| Item da análise                      | Implementação                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pacote incompleto                    | Recuperação dos arquivos de instalação, configuração, instruções e componente `ui.tsx` do histórico da mesma base; dependências completas reinstaladas pelo lockfile.                                                                                         |
| Perda de alterações                  | Novas operações de gravação com versão esperada para campanhas e lugares; bloqueio de salvamentos antigos e de recriação de lugares removidos; confirmação recuperável para repetição do mesmo conteúdo.                                                      |
| Consultas globais e limite de linhas | Carregamento por tela/campanha; contagens com RLS para a visão inicial; paginação independente de entidades, atributos, inventários, magias e dados dos NPCs; atualizações por recurso e recuperação periódica de sincronização.                              |
| Acúmulo de imagens                   | Fila durável, período de proteção, verificação de referências, leases, repetição após falhas e remoção pela API do Storage; conservação de imagens em tokens e históricos; limpeza de reservas interrompidas e cotas preventivas.                             |
| Recuperação de pagamentos            | Processamento retomável por orçamento de tempo, lotes menores de leases, capacidade ampliada e cancelamento de consultas que ultrapassam o prazo; workflow opcional de cinco minutos e exemplo de cron compatível com hospedagem que suporte essa frequência. |
| Concentração de código na mesa       | Extração dos diálogos, geometria, sincronização Realtime e painel de ações do mestre para módulos próprios, mantendo as exportações e as interações existentes.                                                                                               |
| Atualização e diagnóstico            | Roteiro único até a 047, histórico separado, painel administrativo de compatibilidade e manutenção, reprocessamento auditado de limpezas e validação por integração contínua.                                                                                 |
| Limite de requisições                | Limitação em bytes durante a leitura de JSON e dos envios administrativos, inclusive quando a requisição não informa seu tamanho.                                                                                                                             |

## Recuperação de trabalho

Os formulários de campanha, mundo e NPCs também oferecem rascunhos locais separados por conta, registro e aba. É possível recuperar o texto depois de recarregar a página. Recuperar um formulário antigo conserva sua versão de origem; isso permite comparar o texto com o registro atual sem desativar a proteção contra sobrescrita. Arquivos selecionados no computador precisam ser selecionados novamente.

O formulário de envio de mapa ao mural fica pronto com o editor. Publicações continuam separando a imagem compartilhada das notas privadas e dos tokens de planejamento que o mestre escolheu omitir.

## Onde conferir

- `supabase/migrations/202611040047_integrity_and_maintenance.sql`: gravações com versão, resumos, fila de mídias, cotas e diagnóstico.
- `src/services/workspace-reader.ts`, `src/lib/paginated-query.ts`, `src/lib/workspace-loader.ts` e `src/lib/workspace-scope.ts`: consultas e sincronização do workspace.
- `src/hooks/use-editor-draft.ts`: recuperação de rascunhos.
- `src/features/media/maintenance.ts` e `maintenance-server.ts`: remoção segura e retomável de arquivos sem uso.
- `src/features/billing/engine.ts`: novo processamento frequente por prazo.
- `src/features/vtt/table-dialogs.tsx`, `table-geometry.ts`, `use-battle-realtime.ts` e `master-action-panel.tsx`: responsabilidades extraídas da mesa.
- `tests/reliability-047.test.ts`, `tests/reliability-047-database.test.ts` e o caso de conflito em `tests/e2e/campaigns.spec.ts`: regressões específicas desta atualização.
- `LEIA-ME-ATUALIZACAO.md`: instalação, migração, cotas, agendamento e operação.

## Validação e limites

A validação automatizada usa banco local e serviços de teste. Ela não acessa nem modifica o banco publicado ou uma conta real do Mercado Pago. Os resultados finais estão registrados em `VALIDACAO-047.md`.

A manutenção frequente exige ativar o workflow ou configurar o agendador da hospedagem conforme o guia. O pacote mantém o cron diário como padrão para compatibilidade com o Vercel Hobby. Nenhum agendador de produção foi ativado durante a implementação.

O catálogo pronto e as imagens ainda referenciadas são preservados. A limpeza é uma operação posterior à migração e depende do agendamento, do prazo de proteção e de sucesso da API do Storage. A cota de armazenamento é preventiva, pois metadados e uploads em andamento podem se atualizar em momentos diferentes.

As sugestões opcionais de backup completo de campanha e lixeira com histórico de versões do relatório de análise continuam como futuras extensões de produto. Esta entrega implementa as correções técnicas do resumo da análise e a recuperação de rascunhos associada a elas.
