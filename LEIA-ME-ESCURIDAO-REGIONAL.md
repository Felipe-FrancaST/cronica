# Crônica RPG — Áreas de iluminação personalizadas

## Instalação obrigatória

1. Execute **primeiro** a migração anterior `supabase/migrations/202610080022_grid_vision_rules.sql`, se ainda não foi instalada.
2. Execute **depois** `supabase/migrations/202610080023_regional_darkness.sql` no SQL Editor do Supabase para adicionar as novas colunas, validações, permissões e funções de gravação.
3. Publique o código atualizado. Não é necessário cadastrar nenhum segredo novo no ambiente.
4. No projeto local, rode `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.

> A migração 023 deve ser executada antes de usar os novos controles no site publicado, caso contrário as operações de edição retornarão erro.

## Como usar

Na mesa de RPG, na barra superior do grid, o mestre escolhe **Dia** ou **Noite** normalmente. Há controles adicionais para **Visão por personagem** e **Escuridão geral do mapa** (Nenhum, Penumbra, Escuridão, Escuridão mágica). O nível global do dia é salvo separadamente do nível global da noite: ao trocar o período, volta a valer o ajuste que o mestre deixou para aquele período. O padrão do dia é **Nenhum**; mapas antigos não recebem escuridão diurna automaticamente.

Para editar uma região, escolha um dos quatro níveis em **Região**, clique em **Selecionar região**, clique em um canto do grid e clique em outro canto. Um retângulo de células recebe o efeito. O mesmo procedimento funciona no 2D e no 3D. A qualquer momento o botão **Cancelar região** devolve a navegação normal. A opção **Nenhum** cria uma área clara, inclusive dentro de um mapa escuro.

Regiões se sobrepõem: a **mais recente prevalece** na área sobreposta. **Desfazer última** apaga a última região desenhada; **Remover todas** restaura apenas a iluminação ambiente, sem apagar terreno, cenário, tokens, áreas ocultas ou iluminação dos objetos. As regiões são persistidas no banco (limite 120 por mapa) e também são copiadas para novos capítulos com a função de duplicação da mesa.

## Comportamento para os jogadores

- Com **Visão por personagem** ativada, escuridão comum bloqueia a visão de quem não tem fontes de luz/visão no escuro, e o alcance racial, magias e visão diabólica/verdadeira continuam sendo usados. Escuridão mágica ignora as fontes convencionais de luz e a visão no escuro comum.
- **Penumbra** é visualmente escurecida, mas não torna as células invisíveis. Regras de desvantagem em Percepção passiva, se forem aplicáveis à mesa, continuam a cargo do mestre.
- Com **Visão por personagem** desativada, as áreas continuam com aparência escura, mas não ocultam células ou tokens pela regra de visão individual.
- O mestre mantém a visão completa, com contornos das regiões visíveis no 2D; os jogadores não recebem esses contornos de edição.
- A névoa de guerra definida manualmente continua funcionando independentemente da iluminação.

## Notas e verificações

A renderização de sombreado do 2D é calculada em uma máscara de baixa resolução e reutilizada; o 3D usa uma máscara de tela cuja projeção é atualizada somente quando a câmera, cenário ou regras mudam. As regras de visibilidade por célula não são recalculadas a cada quadro da cena.

A suíte de lógica de regiões foi adicionada em `tests/vtt-regional-darkness.test.ts`. Os testes funcionais em um Supabase de produção, em um navegador real e o build completo exigem as dependências `node_modules` e conexão com seu banco; não foram executados neste ambiente.
