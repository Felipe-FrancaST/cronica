# Atualização 019: regras do mestre e oficina de cenários

Este pacote mantém a limpeza anterior e acrescenta avisos para ações bloqueadas, controles de progressão e uma oficina de cenários. Os SQLs antigos, o lockfile e as configurações Supabase/Vercel foram preservados.

## Atualizar a campanha que já funciona

1. Substitua o código pela pasta `cronicarpg` deste ZIP, preservando seu `.env.local`.
2. Abra o SQL Editor do projeto Supabase que já utiliza e execute **somente** `supabase/migrations/202610070019_master_rules_and_scene_workshop.sql`. Ela complementa a instalação existente até a migração 018, sem apagar campanhas, fichas, mapas ou imagens.
3. Execute `npm ci` e `npm run build` e envie o código pelo processo habitual da Vercel.
4. Recarregue as abas dos participantes. O mestre encontra as opções em **Regras**.

Não execute novamente `schema.sql` nem os SQLs anteriores para esta atualização. Mantenha as chaves, autenticação, buckets, Realtime e o projeto na Vercel. O site informa quando a migração 019 ainda não está disponível ao salvar regras ou registrar PV.

## O que mudou

- Cliques em ações bloqueadas exibem o motivo: combate ativo, permissões, turno, recursos esgotados, requisitos e seleção incompleta. Os avisos funcionam também em tela cheia.
- O menu e a página de regras aparecem apenas para o dono da campanha. Além das permissões existentes, o mestre controla multiclasse, método de PV, atributos para novos personagens, descanso e criação de itens personalizados.
- PV podem usar média fixa, dado cheio ou uma rolagem registrada por classe e nível. Resultados são reaproveitados ao reabrir a ficha, repetir uma solicitação ou baixar/subir o nível. Trocar a regra recalcula o máximo sem curar os personagens. Fichas e itens antigos são preservados.
- O cenário ganha tavernas, forjas, estábulos, paredes, pisos, escadas, camas, tapetes, passagens e fontes; casas redesenhadas e novas variantes; categorias, busca, prévia e sete estilos. Construções repetidas compartilham geometrias e usam instâncias em 3D para reduzir chamadas de desenho.

Veja os controles e exemplos de composição em [regras-e-cenarios-v19.md](docs/regras-e-cenarios-v19.md).

Não suba `node_modules`, `.next`, `.env.local`, caches, logs ou relatórios. Os arquivos de ignore mantêm esses materiais fora do deploy, preservando os clientes dentro de `src/lib/supabase`.
