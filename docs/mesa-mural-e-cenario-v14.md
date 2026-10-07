# Mesa, Mural e cenário — v14

Esta versão amplia o cenário para **36 elementos com 71 variantes adicionais**, em 3D e 2D, e organiza a antiga **Mesa tática** como **Mesa → Grid / Mural**. O Grid mantém o combate, fichas, dados, aprovação de ações, terreno, áreas ocultas e portais da versão anterior.

Esta revisão mantém o banco já configurado. A limpeza não exige executar SQL; veja [as instruções de atualização](../LEIA-ME-ATUALIZACAO.md).

## Mesa → Grid

O menu lateral agora mostra **Mesa**. Dentro dela:

- **Grid** abre a batalha e o editor de cenário.
- **Mural** abre os cartões da aventura.

Os endereços `/campanhas/ID/mesa/grid` e `/campanhas/ID/mesa/mural` podem ser abertos diretamente e recarregados. O endereço anterior `/campanhas/ID/mesa` continua abrindo o Grid. O Mural carrega separadamente do motor 3D.

Para decorar, entre em **Grid → Cenário → Editar grid**, com o combate desse mapa encerrado ou em preparação. Use **Buscar elemento ou variante**, escolha o elemento e depois sua variante. Defina a cor, dimensões, rotação, visibilidade e propriedades de movimento antes de colocar a peça.

### Novas variantes

| Elemento | Variantes acrescentadas nesta versão                 |
| -------- | ---------------------------------------------------- |
| Montanha | Nevada, árida, vulcão                                |
| Pedra    | Rocha grande, pedregulhos, musgo, deserto, congelada |
| Flores   | Rosas, girassóis, lavanda, flores secas              |
| Ruínas   | Muro, arco antigo, colunas quebradas, templo         |
| Carroça  | Coberta, mercadorias, quebrada                       |
| Tenda    | Pavilhão, deserto, guerra                            |
| Arbusto  | Deserto e congelado                                  |

As variantes anteriores, como cristal, cogumelos, espinhos, navio, neve, porta e entrada de caverna, permanecem disponíveis.

### Novos elementos

| Elemento        | Aparência padrão e variantes                                        |
| --------------- | ------------------------------------------------------------------- |
| Balcão          | Madeira, pedra, mercador                                            |
| Plantação       | Trigo, horta, abóboras, milho, videiras                             |
| Casa medieval   | Casa de madeira e reboco, chalé de palha, estalagem, torre de vigia |
| Lápide          | Simples, ornamentada, quebrada                                      |
| Cruz            | Madeira, pedra, rúnica                                              |
| Cerca           | Madeira, mureta de pedra, paliçada, grade de ferro                  |
| Grama           | Baixa, alta, seca                                                   |
| Poço            | Pedra, coberto, abandonado                                          |
| Ponte           | Madeira, pedra, corda                                               |
| Mesa de taverna | Retangular, redonda, banquete                                       |
| Cadeira         | Madeira, trono, banqueta                                            |
| Estante         | Livros, pergaminhos, poções                                         |
| Tocha           | Chama, lanterna, luz arcana                                         |
| Banca de feira  | Mercadorias, alimentos, armas                                       |
| Placa           | Simples, direções, estandarte                                       |

Os modelos usam geometrias e materiais próprios: telhados e vigas nas casas, fileiras de cultivos, rodas e coberturas nas carroças, flora de desertos e regiões geladas, arcos e colunas nas ruínas. As peças têm representação correspondente na alternativa 2D, incluindo a cor escolhida.

Cada peça ocupa de **1×1 a 8×8 células**. Casas e outros objetos sólidos bloqueiam o movimento por padrão; plantações permitem passagem com custo 2, e grama e pontes com custo 1. Esses valores podem ser ajustados. A casa representa o exterior; para interiores, monte outro mapa com móveis, balcões e paredes. A ponte é decoração transitável: se houver água ou terreno difícil sob ela, o terreno mantém seu custo até ser pintado como normal. Fogo, lava e demais decorações não aplicam dano automático.

Continuam disponíveis os pincéis de terreno de até **16×16 células**, exclusão pela peça selecionada, pela lista ou por **Apagar objetos**, cores individuais, áreas ocultas e portais com duas pontas por código. Apagar uma peça preserva o terreno pintado sob ela.

## Mesa → Mural

O mestre pode criar quatro tipos de cartão:

| Tipo   | Conteúdo                                                                            |
| ------ | ----------------------------------------------------------------------------------- |
| Local  | Vínculo com um registro de **Locais**, ou lugar personalizado                       |
| NPC    | Imagem e apresentação escolhidas para um NPC, ou personagem narrativo personalizado |
| Imagem | Imagem enviada pelo mestre e descrição                                              |
| Nota   | Pista, aviso, rumor, missão ou texto da aventura, com imagem opcional               |

### Preparar e revelar cartões

1. Use **Vincular local**, **Mostrar NPC**, **Imagem**, **Nota** ou **Novo cartão**.
2. Para Local ou NPC, escolha o cadastro no seletor. O editor preenche título, imagem e descrição; no NPC, usa apenas sua **aparência**, sem copiar a biografia ou estatísticas.
3. Edite o título e o texto que você quer apresentar. Selecione uma imagem JPG, PNG ou WebP, de até **5 MB**, se desejar.
4. Deixe **Mostrar aos jogadores** desmarcado para salvar como rascunho. Marque para publicar.
5. Use **Destacar no mural** para colocar o cartão no início. As setas reorganizam cartões dentro do grupo destacado ou comum.
6. Após salvar, o botão **Rascunho / Visível** alterna a publicação. **Editar** atualiza a apresentação; **Excluir** remove o cartão mediante confirmação.

A vinculação cria uma **apresentação independente**: mudar o cadastro original não sobrescreve seu texto no Mural. No editor, **Usar dados do cadastro** importa novamente os dados atuais. Excluir um cartão mantém o local ou NPC original. Excluir o cadastro original mantém a apresentação existente e remove apenas o vínculo.

Jogadores veem apenas os cartões publicados e podem abri-los para ler a descrição e ampliar a imagem. O cartão de NPC não abre sua ficha. O mestre pode apresentar o retrato de um NPC privado sem liberar atributos, PV, ataques, magias, biografia ou notas reservadas. A autorização de imagem se limita ao arquivo escolhido para o cartão, não à pasta inteira do NPC.

Há busca por título/descrição e filtros de Locais, NPCs, Imagens e Notas. O Mural admite até **300 cartões por campanha** e exibe inicialmente 24, com **Mostrar mais**. As imagens carregam sob demanda. Alterações chegam por Realtime, com atualização ao retornar à janela e verificação periódica; **Atualizar mural** permite atualizar imediatamente.

O Mural pode ser editado durante o combate. A restrição de edição durante combate continua aplicada ao cenário do Grid. Se duas janelas editarem o mesmo cartão, a alteração antiga é recusada: feche o editor, atualize o Mural e abra a versão atual.

As imagens permanecem no bucket privado `campaign-media`, com URLs temporárias de 15 minutos. Ocultar ou excluir um cartão retira-o da interface dos jogadores e revoga novas leituras autorizadas por esse cartão; uma URL já assinada permanece válida até expirar. Na demonstração sem Supabase, o Mural funciona com armazenamento no navegador; o combate compartilhado continua exigindo Supabase.

## Validação

Veja os comandos no [README](../README.md) e os resultados desta revisão no [relatório](limpeza-e-melhorias.md).
