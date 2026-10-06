# VTT v13 — elementos, variantes, cores e pincéis

**Histórico da v13.** A entrega atual é a v14, com Mesa, Mural e migração 015. Para atualizar este pacote, siga [o guia da v14](mesa-mural-e-cenario-v14.md).

O cenário passa a ter 21 elementos, com variantes e cor por peça em 3D e 2D. O mestre pode excluir objetos diretamente no grid, pela lista ou com um pincel. Normal, Difícil, Bloquear e Personalizado usam uma área retangular ajustável, com prévia antes do clique e uma única operação no banco.

## Atualizar seu projeto

1. Extraia o ZIP em uma pasta nova. Abra a pasta que contém `package.json` e copie seu `.env.local` atual para ela.
2. Execute `npm ci`.
3. Se você já aplicou a migração 013 da entrega anterior, execute **somente** `supabase/migrations/202610060014_scenery_variants_and_brushes.sql`, uma vez, no SQL Editor do mesmo projeto Supabase.
4. Se o banco está na 012, aplique a 013 e depois a 014. Se está na 011, aplique a 012, a 013 e a 014. Nas versões anteriores, aplique as migrações pendentes em ordem. Pela CLI, use `npx supabase db push` se o histórico estiver alinhado.
5. Execute `npm run build` antes de atualizar sua hospedagem. Para conferir localmente, execute `npm run dev`.
6. Recarregue as páginas do mestre e dos jogadores após atualizar o código e o banco.

Para um banco novo, `supabase/schema.sql` reúne as 14 migrações na ordem correta. Não reexecute esse arquivo em um banco existente. As migrações 001–013 foram preservadas; a 014 não apaga mapas, fichas ou objetos existentes. Esta entrega não aplicou mudanças no seu Supabase remoto.

## Pintar várias células

Abra **Mesa tática → Cenário → Editar grid** e escolha **Normal**, **Difícil**, **Bloquear** ou **Personalizado**. Ajuste **Largura do pincel** e **Altura do pincel** entre 1 e 16. Há atalhos de 1×1, 2×2, 4×4, 8×8 e 16×16.

A área começa na célula sob o cursor e se estende para a direita e para baixo. A prévia mostra o retângulo; nas bordas do mapa, ele é recortado. Cada clique aplica até 256 células em uma transação, evitando uma requisição por célula.

| Ferramenta     | Resultado                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| Normal         | Remove o terreno pintado na área; mantém os objetos de cenário                          |
| Difícil        | Aplica terreno com custo de movimento 2                                                 |
| Bloquear       | Impede atravessar as células; o clique inteiro é recusado se atingir um personagem      |
| Personalizado  | Usa seu nome de terreno, custo entre 0,1 e 10 e opção de bloqueio                       |
| Apagar objetos | Remove por inteiro as peças de cenário tocadas pelo retângulo; mantém o terreno pintado |

A edição continua disponível apenas ao mestre, fora de combate na sessão do mapa aberto. Mapas ligados por portal compartilham essa proteção. Iniciar combate fecha a edição; encerrar libera os controles. Revelar áreas ocultas continua disponível durante o combate.

## Selecionar e excluir elementos

- Use **Selecionar objeto** e clique na peça. A seleção destaca sua área e exibe **Excluir elemento selecionado** abaixo do grid. O editor também oferece **Remover objeto**.
- Na lista de objetos, cada linha tem uma lixeira com o nome da peça e suas coordenadas.
- Para limpar uma região, use **Apagar objetos**, ajuste o pincel e clique. Objetos grandes são excluídos por inteiro mesmo quando o pincel toca só uma parte deles.

Excluir uma peça mantém o terreno pintado embaixo dela. Excluir uma ponta de portal interrompe a passagem correspondente; os mapas continuam compartilhando a sessão para preservar a iniciativa.

## Elementos e variantes

Ao escolher um elemento, o campo **Variante do elemento** mostra as alternativas disponíveis. As variantes pertencem ao elemento original: por exemplo, escolha **Portal** para selecionar **Porta** ou **Entrada de caverna**; escolha **Gelo** para selecionar **Neve**.

| Elemento | Variantes adicionais      | Movimento padrão                       |
| -------- | ------------------------- | -------------------------------------- |
| Barril   | Caixote                   | Bloqueado                              |
| Fogueira | Braseiro                  | Permitido, custo 1                     |
| Barco    | Navio                     | Bloqueado                              |
| Arbusto  | Arbusto espinhoso         | Bloqueado                              |
| Flores   | Cogumelos                 | Permitido, custo 1                     |
| Estátua  | Obelisco                  | Bloqueado                              |
| Baú      | Baú aberto                | Bloqueado                              |
| Portal   | Porta, Entrada de caverna | Permitido, custo 1; código obrigatório |
| Gelo     | Neve                      | Permitido, custo 2                     |
| Árvore   | Árvore de outono          | Bloqueado                              |
| Pedra    | Cristais                  | Bloqueado                              |
| Estrada  | Estrada de pedra          | Permitido, custo 1                     |

Pinheiro, montanha, ruínas, tenda, carroça, água, fogo, buraco e lava continuam disponíveis. O mestre pode ajustar tamanho, rotação, bloqueio e custo dos objetos; portais mantêm custo 1 e passagem livre. Cada objeto ocupa de 1 a 8 células por dimensão. A colisão usa a área retangular indicada, independentemente da rotação visual.

Porta e entrada de caverna usam as mesmas regras do portal: até duas pontas com o mesmo código na campanha, no mesmo mapa ou em mapas diferentes. Uma ponta sem par fica decorativa. Para uma porta de cenário sem passagem, use um código sem segunda ponta. Barco e navio são peças de cenário; esta atualização não acrescenta pilotagem ou transporte automático de personagens. Fogueiras e terrenos ambientais não aplicam dano automático ao passar: esse efeito continua sob decisão do mestre.

## Escolher a cor

Use **Cor do elemento**, uma das amostras ou **Código da cor** no formato `#RRGGBB`. **Cor padrão** restaura as cores originais do modelo. A tonalidade preserva o relevo e os detalhes do material.

Para uma peça nova, a variante e a cor escolhidas são usadas no próximo clique de posicionamento. Para uma peça existente, selecione-a, altere os campos e clique em **Aplicar alterações**. O identificador da peça é mantido; cor e variante ficam salvas no banco e aparecem para os demais participantes em 3D e 2D conforme a visibilidade do cenário.

## Desempenho e validação

Os modelos reutilizam geometrias e instâncias por tipo e variante. Cores diferentes são atributos de cada instância, evitando criar um conjunto de modelos por cor. As texturas 2D têm cache limitado. A pintura e o apagamento por área fazem uma chamada por clique.

O banco valida variantes, cores, dimensões, colisões, permissões, combate ativo e portais. Os novos objetos também respeitam áreas ocultas e regras de deslocamento. O relatório está em `docs/verificacao-vtt-v13.json`; a comparação com o ZIP v12.1 está em `docs/arquivos-alterados-vtt-v13.json`.
