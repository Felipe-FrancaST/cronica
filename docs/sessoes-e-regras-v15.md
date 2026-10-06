# Sessões e regras da campanha — v15

## Atualizar uma instalação existente

1. Extraia `cronicarpg-sessoes-e-regras-v15.zip` numa pasta nova e abra `cronicarpg-vtt-v15`.
2. Preserve seu `.env.local` atual. Credenciais reais não fazem parte desta entrega.
3. No Supabase, abra o **SQL Editor** do projeto que o site já utiliza.
4. Se já aplicou a migração 015 da Mesa/Mural, copie e execute uma vez o conteúdo de `supabase/migrations/202610060016_campaign_sessions_and_rules.sql`.
5. Se sua instalação está numa versão anterior, execute primeiro as migrações que faltam, em ordem. Não execute novamente `schema.sql` num banco existente. Para um projeto novo, `schema.sql` inclui todas as 16 migrações.
6. No terminal da nova pasta, execute `npm ci` e `npm run build`. Inicie com `npm run dev` ou publique como já fazia, preservando suas variáveis.
7. Atualize a página do mestre e dos jogadores.

As migrações 001–015 permanecem idênticas à entrega v14. A 016 vincula mapas, combates e cartões existentes à sessão **Mesa existente**, sem remover cenários, imagens ou fichas. Se já havia um combate ativo, essa sessão começa ativa para preservar a partida; caso contrário, fica em preparação.

## Criar e jogar uma sessão

1. Em **Campanha → Sessões**, clique em **Criar sessão**.
2. Informe o nome, por exemplo **O início**, e o número, por exemplo **1**. A data e hora de criação são automáticas. Cada número é único dentro da campanha.
3. Enquanto estiver **Em preparação**, o mestre pode preparar novos grids e o Mural. Os jogadores veem sessões iniciadas ou encerradas.
4. Clique em **Iniciar sessão** para começar o registro automático. Só uma sessão da campanha pode estar ativa por vez. Combates exigem uma sessão da aventura ativa.
5. Em **Mesa**, o seletor **Sessão da Mesa** define a qual capítulo pertencem o Grid e o Mural. O endereço preserva essa seleção ao alternar entre as duas áreas.

Turnos e rodadas continuam pertencendo aos combates. Uma sessão da aventura pode conter vários grids e vários combates, mantendo um histórico comum.

## Acontecimentos e imagens

O histórico registra o início e o fim da sessão, cartões adicionados/alterados/removidos, grids, elementos de cenário, entrada e saída de peças, movimentos, início/fim de combate, turnos, pedidos de ação, decisões do mestre, resultados dos dados e aplicação de dano/cura. Os cartões preparados antes do início também entram no histórico inicial.

Em **Sessões → Acontecimentos → Registrar**, o mestre pode acrescentar um título, uma descrição e uma imagem. Ele escolhe se o registro será compartilhado com os jogadores ou ficará só para o mestre.

Rascunhos e NPCs ocultos permanecem privados. O histórico público guarda a apresentação que foi compartilhada, sem conceder acesso às fichas de NPCs ou aos segredos dos locais. Ocultar ou remover um cartão do Mural atual não apaga suas versões anteriormente compartilhadas do histórico da sessão.

Para jogadores, **0 PV registra a queda, sem confirmar morte**. A morte é registrada quando a ficha tem três falhas de salvaguarda com 0 PV, uma condição explícita de morte ou quando o mestre usa **Confirmar morte**. Para NPCs, chegar a 0 PV ou ser marcado **Morto** registra a morte. Confirmações repetidas não duplicam o acontecimento no banco.

O histórico carrega 50 registros por vez, com **Carregar acontecimentos anteriores**. Dados privados não são enviados por Realtime; o histórico atualiza por consulta autorizada.

## Encerrar e consultar

1. Clique em **Encerrar sessão**.
2. Escreva um resumo, se desejar. O resumo é visível aos jogadores.
3. Confirme **Encerrar e arquivar**.

A operação encerra os combates da sessão, expira ações pendentes, cancela movimentos pendentes e remove as peças dos grids. As fichas de jogadores e NPCs continuam na campanha, com o estado de vida e os recursos atuais. O histórico permanece independente das peças e ações removidas.

Os grids, terrenos, elementos, fundos, áreas ocultas, Mural, imagens e acontecimentos permanecem salvos. Mestre e jogadores podem consultar a sessão encerrada. As áreas ainda ocultas continuam pretas para jogadores. O arquivo permite navegar pela câmera e alternar entre 3D e 2D, mas não permite novos combates, rolagens ou edição do cenário.

## Reaproveitar o cenário

1. Crie a próxima sessão, deixando-a em preparação.
2. Abra a sessão antiga e clique em **Reaproveitar cenário**, na página Sessões ou no Grid arquivado.
3. Escolha a sessão de destino, o grid de origem e o nome da cópia.
4. A cópia inclui fundo, elementos, variantes, cores, terreno e áreas ocultas. Fichas, peças, ações e iniciativa não são copiados. Posicione os personagens para a nova aventura.

Também é possível copiar todos os cartões para um Mural de destino vazio. As cópias são independentes; editar a nova sessão não altera a anterior.

Portais com o mesmo código conectam até duas pontas **dentro da mesma sessão da aventura**, inclusive em grids diferentes. Reutilizar um código em outra sessão não conecta o cenário antigo ao novo. Se a sessão de destino já tem duas pontas com esse código, a cópia é recusada e nenhuma alteração parcial fica salva.

## Regras da campanha

| Configuração | Comportamento |
| --- | --- |
| Nível atual do grupo + mestre controla o nível | Atualiza todos os personagens da campanha e bloqueia a edição do campo nas fichas. NPCs mantêm níveis individuais. |
| Permitir criar personagens | Autoriza ou bloqueia a criação de novas fichas pelos jogadores. |
| Permitir editar as próprias fichas | Quando desativado, a ficha pode ser consultada; ações da Mesa e aplicação de dano continuam funcionando. |
| Permitir encerrar o próprio turno | Quando desativado, apenas o mestre avança a iniciativa. |
| Movimento apenas no turno | Padrão aplicado aos novos grids. O mestre pode ajustar cada combate. |
| Falha consome ação e recurso | Padrão aplicado aos novos grids, também ajustável em cada combate. |

Os bloqueios são aplicados na interface e no banco, inclusive em alterações diretas pela API. Ao reduzir o nível do grupo, os usos de dados de vida e espaços de magia são ajustados aos limites do novo nível. Uma ficha aberta antes de uma mudança pode exigir fechar e reabrir antes de salvar, para evitar sobrescrever uma alteração mais recente.

Sessões, Mural, registros manuais e regras também funcionam no modo demonstração, com armazenamento no navegador. O Grid continua exigindo Supabase para persistência e combate compartilhado.

## Verificação técnica

Os testes exercitam a migração de uma Mesa anterior, permissões de mestre/jogador, privacidade dos registros, encerramento e limpeza de peças, arquivo somente para consulta, preservação de imagens, cópias independentes e bloqueio de nível. O relatório desta entrega está em `docs/validacao-v15.md`.
