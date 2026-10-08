# Movimento na escuridão mágica — atualização

## O que mudou
- Em 2D e 3D, o jogador pode clicar/tocar em uma célula escura para tentar mover seu próprio token, mesmo que não consiga enxergar o destino.
- A escuridão mágica continua preta, inclusive na casa do personagem sem visão especial. O próprio token continua identificado e clicável; o cenário e os tokens que ele não pode ver permanecem ocultos.
- Seleção de alvos (magias/ataques) continua exigindo visibilidade. Esta atualização não concede visão especial nem ignora fog-of-war.
- Obstáculos, colisões, gasto de movimento e regras de turno continuam valendo: uma tentativa pode ser recusada se não existir caminho válido.
- O mestre não precisa executar nenhuma migração nova no Supabase para esta correção (as migrações anteriores da visão/áreas ainda são necessárias).

## Instalação
Substitua os arquivos do projeto pela versão atualizada, envie ao GitHub e faça o deploy. Na pasta do projeto, execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build` antes da publicação. Confira os resultados na Vercel.

## Verificação manual recomendada
1. Em um mapa diurno, ative a visão individual e coloque o token do jogador dentro de uma área de escuridão mágica.
2. Entre com a conta do jogador: o mapa deve ficar preto na área, mas o token deve continuar selecionável (2D e 3D).
3. Clique em uma célula escura livre: o personagem deve se mover respeitando o movimento disponível.
4. Tente mover para uma parede ou para uma célula ocupada: a movimentação deve ser recusada.
5. Tente escolher um alvo invisível na área escura: a seleção de alvo deve continuar bloqueada.
6. Conceda Visão Diabólica ou Visão da Verdade e valide a iluminação novamente.
