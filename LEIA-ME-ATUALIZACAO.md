# Atualização 021: superfícies contínuas, iluminação e sessões

Esta atualização mantém a cidade medieval e as melhorias anteriores. Os SQLs antigos, o lockfile, os clientes Supabase e as configurações da Vercel foram preservados.

## Atualizar a instalação existente

1. Substitua o código pela pasta `cronicarpg` deste ZIP, preservando seu `.env.local`.
2. Se já aplicou a atualização 020, execute **somente** `supabase/migrations/202610070021_grid_lighting_and_session_deletion.sql` no SQL Editor do Supabase. Se ainda está numa versão anterior, aplique as migrações que faltam em ordem, terminando na 021.
3. Execute `npm ci` e `npm run build` e publique pelo processo habitual da Vercel.
4. Recarregue as abas dos participantes.

Não execute `schema.sql` novamente. A migração 021 adiciona o período do mapa e as operações de iluminação e exclusão; sua aplicação não exclui sessões nem altera dimensões ou posições dos elementos. Mapas existentes começam em **Dia**.

## O que mudou

- **Superfícies contínuas:** estradas, água, gelo, lava e pisos adjacentes compartilham o padrão visual, com junções sem frestas. Sobreposições são resolvidas sem faces coplanares competindo no desenho. As peças continuam independentes para selecionar, mover e excluir. A grade de medida continua podendo ser exibida ou ocultada.
- **Dia/noite:** na barra do Grid, o mestre escolhe o período para aquele mapa. A escolha fica salva no Supabase e é compartilhada com os participantes. Pode mudar durante o combate; mapas de sessões encerradas preservam sua iluminação para consulta.
- **Luz local:** tochas, lanternas, fogueiras, forjas, lava e elementos mágicos iluminam seus arredores. No editor, use **Emissão de luz** e **Alcance da luz (metros)** para controlar cada peça. A iluminação funciona em 2D, 3D com sombras e 3D leve, sem revelar áreas ocultas.
- **Obelisco:** o catálogo deixa de oferecer a estátua humana. Mapas antigos que a utilizavam passam a desenhar o obelisco, preservando posição, tamanho e nome personalizado.
- **Excluir sessão:** em **Sessões**, o mestre pode excluir uma sessão em preparação ou encerrada. A confirmação informa que os grids, mural, combates e registros daquele capítulo serão apagados definitivamente. Personagens, NPCs, locais e mapas copiados para outras sessões permanecem. Encerre uma sessão ativa antes de excluí-la.

Consulte [o guia da atualização 021](docs/iluminacao-e-sessoes-v21.md). Os elementos de até 128 × 128 células e a criação de Valedouro continuam descritos em [elementos-e-cidade-v20.md](docs/elementos-e-cidade-v20.md).

Não inclua `node_modules`, `.next`, `.env.local`, caches, logs ou relatórios no deploy. Os arquivos de ignore mantêm esses materiais fora da Vercel e preservam todo o código de execução.
