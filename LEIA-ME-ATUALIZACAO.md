# Atualização 054 — Dado cheio como padrão de Arkanis

## Como atualizar a partir da 053

1. Execute `supabase/migrations/202611090054_arkanis_default_pv.sql` no SQL Editor do Supabase, com papel `postgres`. O arquivo separado `padrao-pv-arkanis-054.sql` tem o mesmo conteúdo.
2. Publique o projeto completo desta versão, preservando suas variáveis de ambiente. Use Node.js 22 ou superior, `npm ci`, `npm run typecheck` e `npm run build`.
3. Recarregue o site. Novas campanhas de Arkanis já terão a regra **Dado cheio por nível** gravada. Não é necessário abrir e salvar Permissões para inicializar a regra.

Não é necessário reiniciar o Supabase novamente para esta atualização. Não execute `schema.sql` em banco existente. Se ainda não aplicou a correção 053, aplique-a antes da 054; as instruções de recuperação do loop anterior estão em `docs/historico/LEIA-ME-ATUALIZACAO-053.md`.

## Comportamento

- Ao criar uma campanha de Arkanis, o banco cria suas regras com `hit_point_method = maximum`.
- Campanhas Arkanis existentes sem registro de regras recebem esse padrão. Registros antigos com o padrão legado `average` são normalizados para `maximum`.
- Campanhas onde o mestre já escolheu `rolled` permanecem em rolagem. Nenhuma rolagem registrada é apagada, e fichas existentes não são regravadas pela migração.
- Inserções futuras de regras que omitam o método ou usem o padrão legado são normalizadas para dado cheio apenas no Arkanis. O padrão de D&D permanece inalterado.
- A demonstração local também inicializa novas campanhas Arkanis com dado cheio.
- O mestre pode continuar escolhendo rolagem nas Permissões. Um conflito real, por exemplo uma mudança de regra durante a edição, continua sendo tratado como PT409 e atualiza as regras no editor; a validação não foi removida.

O padrão de PV mantém dado racial + modificador de Resistência por nível; a regra específica dos orcs permanece a mesma das versões anteriores.

A migração é idempotente e preserva as demais permissões e escolhas das campanhas. Consulte VALIDACAO-054.md.
