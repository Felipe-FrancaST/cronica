# VTT v12.1 — edição do grid, áreas ocultas, portais e dados

Esta versão inclui a [correção de acesso aos controles](vtt-correcao-acesso-grid-v12.1.md), aplicada pela migração 013.

## Atualizar a instalação existente

1. Extraia este ZIP em uma pasta nova. Ele contém o projeto completo; `node_modules`, `.git`, arquivos de compilação e credenciais ficam fora do pacote.
2. Copie seu `.env.local` atual para a nova pasta, sem alterar o projeto Supabase utilizado.
3. No terminal da pasta que contém `package.json`, execute `npm ci`.
4. Se o banco já recebeu as migrações 001–012, abra **SQL Editor** no mesmo projeto Supabase, copie o conteúdo de `supabase/migrations/202610060013_scope_grid_editing.sql` e execute uma vez.
5. Se está na 011, execute a 012 antes da 013. Para versões anteriores, aplique as migrações que faltam em ordem. O arquivo `supabase/schema.sql` serve para a instalação inicial de um banco novo; não o reexecute sobre o seu banco existente.
6. Para um projeto que usa o histórico da CLI, `npx supabase db push` aplica as migrações pendentes; evite misturar esse fluxo com a execução manual sem alinhar o histórico.
7. Execute `npm run dev` para conferir localmente, ou `npm run build` antes de atualizar sua hospedagem. Depois da atualização, recarregue as páginas de mestre e jogador.

A migração 012 acrescenta a névoa, valida os portais e atualiza as funções e políticas da mesa. A 013 corrige a regra de bloqueio da edição. As migrações 001–012 foram preservadas. Os personagens, fichas, imagens e objetos existentes permanecem no banco. Os testes usaram PostgreSQL local e participantes de teste; não alteraram o seu Supabase.

## Editar o cenário

Abra **Cenário → Editar grid**. Escolha um objeto, suas dimensões e seu custo de movimento; clique no grid para posicionar. **Selecionar objeto** permite mudar posição, tamanho, rotação, visibilidade individual e remover uma peça. **Concluir edição** encerra as ferramentas.

A edição fica indisponível enquanto houver combate ativo na sessão do mapa aberto, tanto na interface quanto no banco. Mapas ligados por portal compartilham essa sessão e o bloqueio; mapas independentes e sessões antigas sem mapa não bloqueiam o cenário aberto. Iniciar um combate nessa mesa fecha a edição automaticamente. Terrenos, objetos, imagem e configuração espacial do mapa ficam protegidos; fichas de NPCs e ações de combate continuam disponíveis. **Configurar mapa** pode ser aberto diretamente fora de combate, sem precisar clicar antes em **Editar grid**.

| Elemento                                                   | Movimento padrão                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Árvore, pinheiro, pedra, montanha, ruínas, tenda e carroça | Bloqueado; o mestre pode ajustar                           |
| Buraco                                                     | Bloqueado; o mestre decide como a criatura pode atravessar |
| Água e gelo                                                | Permitido, custo 2 por célula; ajustável                   |
| Estrada                                                    | Permitido, custo 1                                         |
| Fogo e lava                                                | Permitido, custo 1; dano ambiental é decidido pelo mestre  |
| Portal                                                     | Permitido, custo 1; código obrigatório                     |

Objetos usam áreas de 1–8 células por dimensão, com limites e colisões verificados no servidor. Objetos grandes continuam ocupando a área retangular indicada, independentemente da rotação visual. O terreno pintado sob um objeto permanece: remover a decoração restaura esse terreno. Água não remove uma parede ou obstáculo colocado no mesmo lugar.

No modo 3D, o clique e a prévia de deslocamento agora usam a célula exata sob o cursor. Uma área grande de água não redireciona o movimento para a origem do objeto. O custo de travessia é aplicado uma vez por etapa; áreas sobrepostas usam o maior custo. A movimentação não gasta a ação do personagem. Se o deslocamento acabou, use a próxima rodada ou uma ação de Disparada conforme as regras da mesa.

## Ocultar e revelar áreas

Durante a edição, clique em **Ocultar área**, escolha o pincel de 1×1 a 8×8 células e clique nos trechos que deseja cobrir. Os jogadores veem essas células pretas em 3D e 2D. Peças de outros participantes, objetos e terreno dentro da área oculta são filtrados pelas políticas do banco. O jogador mantém o acesso ao próprio personagem.

O mestre pode usar **Revelar área** mesmo durante o combate: escolha o tamanho do pincel e clique na área preta. A revelação atualiza o mapa e os participantes recebem os dados que se tornaram visíveis pelo Realtime; a atualização periódica e o retorno à aba também sincronizam a mesa.

Magias de área continuam afetando criaturas dentro da região oculta quando a geometria do efeito as alcança. O resultado compartilhado omite os nomes e a quantidade dos alvos ocultos. O mestre pode conferir os PV dessas criaturas pelas fichas.

## Conectar portais

1. Em **Editar grid**, escolha **Portal** e informe um código, por exemplo `FLORESTA-01`.
2. Coloque a primeira ponta no grid.
3. Coloque a segunda ponta com o mesmo código no mesmo mapa ou em outro mapa da mesma campanha.
4. Cada código permite no máximo duas pontas. Use letras, números, hífen ou sublinhado, até 24 caracteres. Os códigos são normalizados para maiúsculas. Duas pontas no mesmo mapa precisam ocupar áreas diferentes.
5. Conclua a edição. Mova o personagem para dentro da área do portal e clique em **Atravessar portal**, abaixo do grid.

Mapas conectados compartilham a sessão de combate e a iniciativa. A travessia mantém o mesmo token, turno, deslocamento restante, ações, bônus, reações, ficha e espaços de magia. Chegar até a entrada consome o movimento normal; a travessia não gasta uma ação nem movimento adicional. O jogador acompanha automaticamente o personagem ao mudar de mapa, inclusive depois de recarregar a página. O mestre pode clicar na peça na lista de iniciativa para abrir o mapa onde ela está.

A saída precisa estar visível, desocupada e grande o bastante para a peça. Durante o combate, a travessia respeita o turno e aguarda ações ou reações pendentes. Repetir a mesma requisição não teleporta novamente. Um portal sem segunda ponta permanece decorativo até ser ligado. Remover uma ponta interrompe a passagem; os mapas continuam compartilhando sua sessão para preservar a estrutura da iniciativa.

## Dados e fluidez

A animação usa projeção de poliedros em Canvas 2D, com cores por tipo de dado, sombras, reflexos, trajetórias individuais e desaceleração até a face correta. O resultado final aparece após a animação. d100 usa dezenas e unidades. Vantagem e desvantagem identificam o dado descartado.

O resultado vem do servidor e a animação apenas o apresenta. Desativar **Animar os dados** ou usar a preferência de movimento reduzido mostra o resultado sem a sequência animada.

O cenário reutiliza instâncias 3D, índices de deslocamento e dados que não mudaram. A névoa usa uma camada de instâncias. Sombras são atualizadas quando necessário, e as chamas usam uma deformação leve no shader. O modo **3D leve** desativa o ciclo contínuo de animação do fogo; abas ocultas pausam a renderização. O modo 2D mantém as texturas e os novos elementos.

## Verificação

Os resultados e o manifesto originais da v12 estão em `docs/verificacao-vtt-v12.json` e `docs/arquivos-alterados-vtt-v12.json`. A correção v12.1 tem seu próprio relatório e manifesto, com o sufixo `v12.1`.

Na validação original da v12: **99 testes de lógica/banco + 29 cenários de VTT no navegador + 8 testes gerais no build de produção = 136 testes distintos aprovados**. Veja o relatório da v12.1 para a validação desta correção.
