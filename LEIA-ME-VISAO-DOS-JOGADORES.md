# Visão dos jogadores e iluminação

## Atualização

Com a base já atualizada até a migração 043, execute **somente** `supabase/migrations/202610250044_player_lighting_controls.sql` no SQL Editor do Supabase. Depois publique o código deste pacote. Não é necessário alterar variáveis de ambiente. Não execute novamente migrações anteriores.

A 044 acrescenta o salvamento conjunto das opções de visão e corrige o caso em que um sentido de alcance zero revelava o chão da própria célula. As migrações 001–043 foram preservadas.

## Configuração do mestre

No Grid, abra **Cenário → Luz e visão → Visão dos jogadores**. As opções são salvas por mapa e podem mudar durante o combate.

- **Noite escura:** ativa a visão por iluminação, escolhe noite e aplica escuridão total.
- **Noite com penumbra:** ativa a visão por iluminação e deixa o cenário visível, porém escurecido.
- **Dia iluminado:** ativa a visão por iluminação com luz ambiente normal.

Os campos de período e escuridão permitem ajustes adicionais, incluindo escuridão mágica. **Modo de visão → Mapa visível** desativa a limitação individual; nesse modo, as sombras são apenas visuais. Os três atalhos voltam a ativar a visão por iluminação.

O mestre continua enxergando o mapa inteiro. O resultado da visão individual aparece na tela de cada jogador a partir das criaturas que ele controla.

A conta dona da campanha mantém a visão do mestre. Para conferir o resultado do jogador, use a tela de um participante da campanha.

## Comportamento dos jogadores

| Situação | Resultado |
| --- | --- |
| Penumbra, sem visão no escuro | Cenário visível e escurecido. |
| Escuridão comum, sem visão no escuro | Apenas a própria peça permanece visível; o chão e outras criaturas ficam ocultos. |
| Escuridão comum, com visão no escuro | Cenário em tons de cinza dentro do alcance racial, convertido para a escala do mapa. |
| Penumbra dentro do alcance de visão no escuro | Visão normal nessa área. |
| Tocha ou outra fonte acesa | Sua área iluminada fica visível quando existe linha de visão até ela. |
| Fonte apagada | Sua área volta à iluminação ambiente imediatamente após a confirmação da alteração. |

Exemplo: visão no escuro de 18 m alcança 12 células em um mapa de 1,5 m por célula, ou seis células se cada célula representar 3 m. O alcance usa a distância no mapa, formando uma área circular; não abre o mapa inteiro.

Uma tocha comum ilumina 6 m e cria mais 6 m de penumbra. Ela pode revelar uma área distante, mesmo além do alcance racial, sem revelar o caminho escuro entre a criatura e a luz. O mestre pode ajustar o alcance das fontes nos controles dos elementos.

Paredes, portas fechadas e barreiras de visão continuam bloqueando. Áreas explicitamente ocultadas pelo mestre precisam ser reveladas por ele. Escuridão mágica não é atravessada por visão no escuro comum ou tochas; sentidos especiais e magias apropriadas continuam sendo considerados.

## Fluidez e conferência

As três opções principais são salvas em uma única operação. O retorno atualiza somente o mapa, preservando o terreno, as peças e os caches da revisão de desempenho. A mudança não recarrega todo o cenário.

O pacote inclui testes dos alcances de todas as raças do catálogo, escala em metros e pés, penumbra, escuridão, luz distante, fonte apagada, paredes e áreas ocultas. Há testes de interface para os controles do mestre e para a imagem efetivamente exibida ao jogador em 2D, além de conferência visual em 3D.

Validação desta revisão: 566 testes automatizados, 44 testes de interface, compilação de produção e verificação de formatação aprovados.
