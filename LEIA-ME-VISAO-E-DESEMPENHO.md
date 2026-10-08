# Atualização do grid — visão individual e desempenho

Este pacote modifica o projeto **Crônica RPG** enviado pelo usuário, mantendo a estrutura Next.js/React/Supabase original.

## Implantação — essencial

1. Faça cópia de segurança do projeto e do banco de dados.
2. Execute **em seu projeto Supabase**, via migração ou SQL Editor, `supabase/migrations/202610080022_grid_vision_rules.sql`. Essa etapa adiciona os campos de visão e as RPCs autorizadas ao mestre; **sem ela o controle da interface não salva as preferências**.
3. Instale as dependências (`npm ci`) e valide (`npm run typecheck`, `npm test`, `npm run build`) num ambiente com acesso aos pacotes. Inicie com `npm run dev` ou publique normalmente.
4. Configure variáveis de ambiente com base em `.env.example`. O arquivo particular `.env.local` recebido não foi incluído no pacote atualizado para não redistribuir segredos.

**Atenção ao histórico SQL:** o ZIP fornecido traz migrações até `202610070018`, porém parte do código/documentação menciona migrações 019–021 que **não estavam no arquivo**. A migração nova funciona a partir do esquema até 018 e inclui a RPC de dia/noite como alternativa caso esteja ausente, mas **não reconstitui funcionalidades de 019–021 não enviadas**. Se seu banco ainda não tiver executado essas versões, recupere-as da versão original antes de usar funcionalidades como a geração de cidade medieval. Se elas já estiverem aplicadas no Supabase, não as reaplique.

## Uso pelo mestre

No grid da campanha, escolha **Noite**, marque **Visão por personagem** e selecione um nível:

- **Penumbra**: personagens sem visão especial têm visibilidade aproximada de até 18 metros, enquanto habilidades ampliam o alcance. É uma aproximação de gameplay; no D&D, penumbra também impõe efeitos em testes de Percepção que esta mudança visual não aplica.
- **Escuridão**: enxergam as células no alcance indicado pela raça/habilidades ou iluminadas por fontes de luz. Personagens sem essas condições enxergam apenas a própria posição.
- **Escuridão mágica**: visão no escuro comum e fontes luminosas não atravessam a escuridão. Visão diabólica e visão verdadeira reconhecidas pela ficha/efeito fornecem alcance.

Desmarcar **Visão por personagem** mantém o funcionamento anterior. Durante o **Dia**, essa regra de limitação noturna não interfere no mapa. O mestre mantém visão irrestrita. O jogador enxerga a união dos campos de visão de suas peças controladas ou das fichas que lhe pertencem. Sem peça associada, a visão do jogador fica restrita até que o mestre coloque um token.

A escala do grid (`m` ou `ft`) é convertida para metros. A linha de visão considera paredes/células bloqueadas, objetos com `blocks_vision`, fontes de luz e a neblina/áreas ocultas previamente existentes.

A visão na ficha é obtida do catálogo racial, incluindo as distâncias específicas das raças, e da escolha de **Visão Diabólica** quando indicada. Efeitos ativos reconhecidos: **Visão no Escuro / Darkvision**, **Visão da Verdade / True Seeing**, **Luz / Light**, **Luz do Dia / Daylight**, **Luzes Dançantes / Dancing Lights**, **Chama Contínua / Continual Flame**. Os efeitos precisam ter sido registrados no sistema de efeitos ativos da batalha; escrever o nome no bate-papo sem criar um efeito não modifica o grid. Os efeitos luminosos presos a criaturas seguem os tokens **quando o lançamento tem alvo identificado**.

Esta camada é uma **restrição visual na interface**, não é um sistema de anti-trapaça de rede: ela não impede inspeção programática de dados enviados ao navegador pela API. Para sigilo estrito, seria necessário filtrar dados na origem por usuário no backend. O renderizador 3D utiliza máscara de solo em resolução reduzida; objetos altos vistos lateralmente podem demandar aperfeiçoamentos adicionais de oclusão em cenas complexas.

## Correções e desempenho

- Campo de visão calculado sob demanda, quando mudam mapa, efeitos, tokens e obstáculos; não é recalculado a cada movimentação da câmera.
- Máscara 2D armazenada em canvas; máscara 3D de baixa resolução reprojetada quando necessário.
- Grid 2D desenha terreno e linhas visíveis na área do viewport, reduzindo custo com mapas grandes.
- Cenários 2D pré-agrupados por superfícies/ordem e desenhados com descarte de objetos fora da tela.
- Redução de atualizações redundantes em `ResizeObserver` e movimentos do cursor.
- Correção nas consultas de ações e efeitos quando uma campanha ainda não possui sessões ou mapas, evitando `IN ()` vazio.
- Proteção das interações de seleção, destinos e alvos contra cliques em células fora do campo de visão no 2D e no 3D.

## Validação disponível neste ambiente

- Análise sintática de **156 arquivos TS/TSX**: nenhum erro de sintaxe.
- Testes isolados da lógica (`tests/vtt-vision.test.ts`): **5 cenários aprovados** com as dependências auxiliares simuladas.
- **Build completo, checagem semântica TypeScript e testes de interface não executados com sucesso**: não foi possível baixar as dependências NPM no ambiente da análise. Recomenda-se executar a suíte completa após `npm ci` na sua máquina/CI e validar com duas contas (mestre e jogador) e no Supabase real.

## Principais arquivos editados

- `src/features/vtt/vision.ts` e `vision-layer.ts`: cálculos e máscaras.
- `src/features/vtt/tactical-table.tsx`, `tactical-canvas.tsx`, `tactical-scene.tsx`: interface e integração do grid.
- `src/features/vtt/scene-engine.ts`, `scenery-art.ts`, `repository.ts`, `viewport-types.ts`, `types.ts`, `src/app/globals.css`: integração, persistência e otimizações.
- `supabase/migrations/202610080022_grid_vision_rules.sql`: alterações SQL.
- `tests/vtt-vision.test.ts`: testes automatizados.
