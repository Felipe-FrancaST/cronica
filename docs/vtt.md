# Mesa tática / VTT 2D

A primeira versão do VTT da Crônica usa **coordenadas lógicas de grid** como fonte de verdade. O Canvas é somente a projeção visual; mover/zoomar o mapa nunca altera `token.x`/`token.y`. Isso permite trocar o renderer por Three.js/React Three Fiber no futuro sem migrar o estado de combate.

## Fluxo

1. O Mestre abre **Campanha → Mesa tática** e cria um mapa.
2. Configura largura/altura, tamanho visual da célula, escala (`m`/`ft`), regra diagonal, visibilidade/opacidade do grid e imagem privada do mapa.
3. Adiciona um personagem. `add_character_to_battle_map` cria o token a partir da ficha e usa o deslocamento real do módulo D&D 5e.
4. O Mestre pode adicionar NPCs informando o deslocamento (o modelo de NPC atual ainda não possui esse campo), definir controlador e visibilidade.
5. Terreno normal, difícil e bloqueado é persistido em `battle_map_cells`.
6. O cliente calcula a prévia com A*. O banco recebe o caminho e o revalida dentro de `move_battle_token` antes de persistir.
7. Em combate, o Mestre informa a iniciativa real. O token ativo recebe o deslocamento máximo; cada movimento desconta o custo e o próximo turno restaura o movimento daquele participante.
8. Alterações de mapas, células, tokens e turnos são publicadas via Supabase Realtime.

## Segurança

Jogadores não recebem `UPDATE` direto em `battle_map_tokens`. Movimento passa por RPC `SECURITY DEFINER`, que valida autenticação, campanha, controlador, turno, versão otimista, limites, passos adjacentes, cantos bloqueados, terreno, colisões e deslocamento restante. O Mestre mantém autoridade administrativa e pode usar o modo de movimento forçado.

RLS também impede jogadores de editar mapa/células/objetos de cena e não expõe tokens ocultos nem seus registros de iniciativa/histórico. Imagens do mapa permanecem no bucket privado `campaign-media` e são servidas por URL assinada.

## Estrutura persistida

- `battle_sessions`: estado de combate, rodada, turno e token ativo.
- `battle_maps`: dimensões lógicas, escala, regra diagonal, configuração visual e background.
- `battle_map_cells`: terreno esparso (`movement_cost`, `blocked`, metadata).
- `battle_map_objects`: geometria renderer-agnostic para futuras paredes, portas, luzes, efeitos e visão.
- `battle_map_tokens`: vínculos com personagem/NPC, `(x,y,z)`, controlador, visibilidade e deslocamento.
- `battle_turn_order`: iniciativa ordenada.
- `battle_movements`: trilha de auditoria com origem, destino, custo e caminho.

## Preparação para 3D

Tokens e células já possuem `z`; objetos de cena usam `geometry`/`metadata` e flags separadas para bloquear movimento e visão. A camada de regras (`movement.ts`) não conhece Canvas. Para a próxima fase, o renderer pode projetar o mesmo snapshot em Three.js enquanto pathfinding, RLS, RPCs, turnos e histórico continuam válidos.

Áreas de magia podem ser representadas por `battle_map_objects` com `object_type='effect'` e uma geometria de círculo/cone/linha; paredes/portas podem usar `blocks_movement`/`blocks_vision`. A implementação visual dessas ferramentas fica para a fase seguinte.
