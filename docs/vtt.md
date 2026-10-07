# Mesa · Grid / VTT 3D

A mesa abre em **3D real com Three.js/WebGL2**, com tabuleiro em perspectiva, luz, sombras, obstáculos com volume e peças com bases e retratos. A opção **2D** continua disponível. Ambas as vistas usam o mesmo mapa, terrenos, tokens e regras; trocar a câmera não altera as posições no banco.

Esta revisão mantém o banco já configurado. A limpeza não exige executar SQL; veja [as instruções de atualização](../LEIA-ME-ATUALIZACAO.md).

## Controles

| Controle                | Comportamento                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| Jogar                   | Selecionar peças, clicar em destinos e arrastar peças controláveis |
| Arrastar chão vazio     | Navegar pelo mapa após ultrapassar o limite de arraste             |
| Girar                   | Arrastar para orbitar a câmera sem movimentar peças                |
| Navegar                 | Arrastar para deslocar a câmera sem selecionar peças               |
| Botão direito           | Girar a câmera; botão do meio navega                               |
| Scroll / dois dedos     | Aproximar/afastar; dois dedos também navegam                       |
| Isométrica / Superior   | Trocar a orientação da câmera                                      |
| Ajustar mapa            | Voltar a enquadrar o tabuleiro inteiro                             |
| Focar peça              | Centralizar e aproximar o personagem selecionado                   |
| Expandir mesa           | Tela cheia, quando o navegador permite                             |
| 3D leve                 | Reduzir a resolução e desativar sombras                            |
| `+`, `-`, `0`, `Q`, `E` | Zoom, enquadrar e girar, quando o canvas está em foco              |

No celular, toque na peça e depois no destino: o primeiro toque mostra o caminho, o segundo confirma. Arrastar a peça também funciona. Pinça, cancelamento de toque e navegação nunca terminam como uma ordem de movimento.

Os nomes das peças mantêm tamanho legível na tela. Ao afastar muito, a mesa prioriza o nome da peça selecionada e da peça ativa para reduzir a sobreposição. Tokens sem retrato exibem as iniciais. Tokens ocultos aparecem transparentes para o mestre; jogadores continuam sujeitos às políticas de visibilidade do banco.

## Preparar o combate

1. O mestre cria/configura um mapa: largura, altura, escala (`m`/`ft`), diagonal, grid e imagem privada de fundo.
2. Adiciona personagens e NPCs. Personagens usam o deslocamento da ficha; NPCs usam o valor informado pelo mestre.
3. Pinta terreno normal, difícil, bloqueado ou personalizado. Bloqueios viram obstáculos elevados; terrenos difíceis e água recebem uma representação distinta.
4. Seleciona uma peça para consultar alcance e prévia de caminho. O custo respeita A*, diagonais, cantos, terreno, colisões e movimento disponível.
5. Define a iniciativa e inicia o combate. Cada movimento consome deslocamento; o próximo turno restaura o movimento do participante ativo.

Mapas, células, tokens e turnos continuam sincronizados via Supabase Realtime. Retornar à aba e a atualização periódica também recarregam a mesa. Dados de terreno são paginados, inclusive em mapas com mais de mil células personalizadas.

## Arquitetura

- `tactical-table.tsx`: dados da campanha, turnos, controles e formulários.
- `tactical-scene.tsx`: ponte React, gestos, seleção e prévia de movimento/áreas em 3D.
- `scene-engine.ts`: câmera, iluminação, projeção, imagens e recursos da GPU.
- `tactical-canvas.tsx`: vista 2D alternativa.
- `interaction.ts` / `viewport-types.ts`: contrato e regras de controle comuns.
- `movement.ts`: pathfinding independente de renderização.
- `repository.ts`: consultas paginadas e RPCs de movimento/ações.
- `action-panel.tsx` / `effects.ts`: ficha na mesa, seleção de fontes, áreas, fila do mestre e efeitos persistentes.
- `map-image.ts`: validação e otimização de imagens do tabuleiro.

A renderização 3D ocorre sob demanda e durante gestos/animações; não mantém um loop de desenho ocioso. A resolução é limitada a 1,5 vezes a resolução CSS no modo com sombras e a 1 no modo leve. Terrenos usam instâncias para reduzir chamadas de desenho. Trocas de mapa/vista liberam geometrias, materiais, texturas, eventos e contexto WebGL. Se o contexto não puder ser criado ou for perdido, a mesa abre em 2D com uma mensagem.

## Persistência e acesso

As coordenadas lógicas `(x,y)` continuam como fonte de verdade. O eixo `y` lógico corresponde à profundidade da cena; `z`, quando presente nos dados, é desenhado como elevação. A câmera é local ao navegador e não é compartilhada entre jogadores.

Movimentos continuam passando por `move_battle_token`, com caminho e versão otimista. A RPC valida usuário, controlador, turno, limites, adjacência, cantos, terrenos, colisões e deslocamento restante. O cliente também recusa caminhos acima das 500 etapas aceitas pela RPC. O modo de movimento forçado permanece exclusivo do mestre.

A atualização não amplia permissões nem publica imagens privadas. Os fundos/retratos mantêm o fluxo de URLs assinadas. As tabelas de mapa são `battle_sessions`, `battle_maps`, `battle_map_cells`, `battle_map_objects`, `battle_map_tokens`, `battle_turn_order` e `battle_movements`. A migração 009 acrescenta `battle_action_requests`, `battle_action_effects`, `battle_spell_effects` e `battle_movement_plans`, com acesso controlado por campanha/personagem.

## Escopo visual

A imagem enviada para o mapa funciona como textura do chão; a mesa não reconstrói automaticamente prédios, árvores ou relevo a partir da arte. As peças são miniaturas geométricas com retratos, sem importação de modelos GLB/GLTF. Obstáculos elevados representam as células bloqueadas existentes.

As regras de combate continuam no plano lógico do grid. O cenário já inclui elementos, variantes, cores, áreas ocultas reveladas pelo mestre e portais entre mapas. Colisões consideram toda a base de criaturas grandes, e áreas de magia funcionam no plano do grid. Modelagem livre, rampas, movimento vertical e linha de visão automática precisam de uma expansão própria.

## Validação

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:vtt
```

`test:vtt` inicia uma API local com dados de teste e um servidor Next.js nas portas 54329 e 3100. Não usa o seu projeto Supabase e não modifica campanhas reais. Cobre renderização, clique/arraste, limites de movimento, pinça, confirmação por toque, controle do mestre/jogador, ocultação, terreno, troca de vistas, falha de WebGL, upload com nova tentativa, ficha na mesa, escolha de arma/magia, aprovação, falha, PV/espaços e prévia de cone no celular.

A suíte de regras/SQL executa as migrações em PostgreSQL local via PGlite. A validação final de autenticação, duas contas simultâneas, Realtime e uploads remotos deve ocorrer no seu ambiente Supabase.
