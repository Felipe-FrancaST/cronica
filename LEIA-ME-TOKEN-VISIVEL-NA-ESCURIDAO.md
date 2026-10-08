# Correção: personagem completo visível na escuridão

## O que foi corrigido

No grid **3D**, a máscara de escuridão mostrava apenas um pequeno círculo com as iniciais do personagem (como "KA"). Agora a máscara é composta no próprio WebGL e, por cima dela, o sistema renderiza novamente **o modelo 3D original do token controlado pelo jogador** — com corpo, retrato/foto configurada, nome e contornos de seleção.

O cenário continua oculto/preto conforme as regras, inclusive sob o próprio token. Nenhum buraco é aberto no fog de visão e **personagens adversários fora de visão não são renderizados acima da máscara**.

No grid **2D**, a imagem completa do token já era desenhada por cima da máscara; esse comportamento foi preservado.

A movimentação na escuridão, a validação de paredes/colisões, o limite de deslocamento, os turnos e as magias de visão continuam seguindo as regras já existentes.

## Instalação

Substitua os arquivos do projeto pelo conteúdo deste ZIP e envie o código ao GitHub/Vercel. **Não há migração nova no Supabase para esta correção.** As migrações de visão anteriores (022 e 023) continuam necessárias para projetos que ainda não as instalaram.

Na instalação local, execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.

## Verificação recomendada após publicar

1. Abra uma mesa 3D com a conta do jogador e um personagem que tenha retrato de token configurado.
2. Posicione o token em **Escuridão mágica** e mantenha **Visão individual** ativada.
3. Confira se o token aparece **com seu visual 3D normal**, não só com as iniciais, enquanto o chão e os demais objetos permanecem ocultos.
4. Gire a câmera, aplique zoom, mova o token e confirme que o personagem acompanha a posição corretamente.
5. Confirme que inimigos fora da visão seguem invisíveis e que movimentos inválidos continuam bloqueados.
6. Repita no modo 2D e teste a desativação da visão individual.

## Notas técnicas

- `src/features/vtt/vision-layer.ts`: máscara via textura no framebuffer WebGL e segunda passagem somente dos tokens do jogador.
- `src/features/vtt/scene-engine.ts`: acesso ao grupo visual já carregado no motor 3D, evitando texturas duplicadas.
- `src/features/vtt/tactical-scene.tsx`: integração da máscara e da segunda passagem na atualização da cena.
- A máscara de iluminação continua armazenada em baixa resolução e é recalculada apenas se câmera, visibilidade ou iluminação mudarem. O modelo 3D é desenhado no próprio WebGL, sem ler pixels da GPU de volta para a CPU.

A verificação completa do aplicativo em navegador e build de produção depende das bibliotecas NPM e não foi possível executá-la no ambiente de edição. Use a Vercel e um navegador real como validação final.
