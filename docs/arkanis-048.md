# Arkanis no Crônica — primeira etapa

Fonte: **Arkanis — Livro de Regras**, PDF `DOC-20260429-WA0005..pdf` enviado pelo usuário, 26 páginas, datado de 29/04/2026, com encerramento assinado por Felipe França. As páginas abaixo são as posições físicas no PDF, pois a numeração impressa se repete em um ponto. O PDF original não foi modificado nem incorporado ao ZIP.

| Parte do dossiê | Campos                                                                                                                                            | Base no PDF                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade      | Nome, raça, nível, idade, aparência, origem, motivação, traço marcante, história, idiomas e notas                                                 | Criação, p. 3; raças, p. 8–15. Campos descritivos adicionais ajudam a registrar a personagem.                                                                  |
| Atributos       | Força, Agilidade, Resistência, Inteligência, Sensibilidade, Presença; valor-base, ajuste e total                                                  | P. 3. Valores padrão 20, 19, 18, 15, 14, 12 ou seis rolagens de 3d6 + 4, redistribuíveis.                                                                      |
| Modificadores   | Faixas próprias de −5 a +5                                                                                                                        | Tabela da p. 3. Não se usa a fórmula de modificadores de D&D.                                                                                                  |
| Arkano          | Corpo, Mente e Espírito (d10), evolução/ajuste, total e modificador                                                                               | P. 4. Cada 10 concede +1 ao atributo de vínculo; os bônus são incluídos uma vez no total.                                                                      |
| Vitalidade      | HP atual/máximo, Mana atual/máxima, Sanidade atual/máxima                                                                                         | P. 5–7; dados de HP por raça, p. 8–15. Sanidade começa em 10.                                                                                                  |
| Defesa          | Reflexos, ajuste, deslocamento, armadura, VA, DUR atual e máxima                                                                                  | P. 6. Reflexos usam os valores finais de AGI e SEN, com divisão arredondada para baixo.                                                                        |
| Aptidões        | Conhecimentos, Capacidades, Habilidades sociais e Sentidos; níveis 0–3 e bônus 0/+5/+10/+15                                                       | P. 7. Conhecimento Mecânico é incluído como campo do traço anão da p. 11. Aptidões adicionais podem ser anotadas.                                              |
| Arsenal         | Arma, dado-base, maestria, alcance, requisitos, treino e notas                                                                                    | P. 16–18. A mesa confirma a evolução; a ficha não concede maestria por atingir um atributo.                                                                    |
| Grimório        | Nome, NA, origem do aprendizado, estado e maior ordem dominada; custos, dano, área, requisitos, materiais, tempo, duração e efeitos em cada ordem | P. 21–23. Ordens: Primária, Desperta, Elevada, Arcana, Suprema e Divina.                                                                                       |
| Técnicas        | Nome, NA, Força/Agilidade exigida para aprender, origem, domínio, requisitos e efeito                                                             | P. 23–25. Técnicas não recebem campos de custo de Mana.                                                                                                        |
| Bolsa           | Objetos, quantidade, peso, tag ingredientes, referência do catálogo, observações e riqueza registrada                                             | Infraestrutura do Crônica e solicitação do usuário. Pesos e preços de ingredientes não foram inventados; o peso inicial cadastrado é zero e pode ser ajustado. |
| Alquimia        | Ingredientes possuídos e catálogo de 180 materiais em 18 habitats                                                                                 | Lista enviada pelo usuário neste pedido. As afinidades não foram tratadas como receitas ou regras do livro.                                                    |

## Raças

Humano, Elfo, Anão, Orc, Tritão, Harpia e Demônio são oferecidos conforme o livro. Os atributos raciais e os +7 de Arkano do elfo entram no cálculo. O +1 de Reflexos do demônio é separado do cálculo-base. O humano escolhe o atributo adicional. O dado racial e as capacidades especiais aparecem para conferência.

Aptidões raciais são registradas na seção Aptidões e não são somadas novamente a cada troca de raça. A ficha inicial humana contém Lógico em nível 1. As demais habilidades e usos permanecem sob acompanhamento do mestre. Bônus como os +8 HP do orc devem fazer parte do máximo de HP informado; não são adicionados uma segunda vez.

## Pontos que dependem da mesa

- A tabela de Arkano inclui o valor 75 em duas faixas. O cálculo sinaliza esse caso e exige registrar o modificador da mesa.
- A tabela de maestria 3 da p. 16 mostra três dados; o exemplo usa quatro. A arma nesse nível exige escolher três ou quatro.
- A p. 6 diz descontar da DUR o valor reduzido pela armadura, mas o exemplo desconta o dano final. A ficha acompanha DUR sem decidir isso automaticamente.
- A p. 5 apresenta a fórmula de Mana com pontuação ambígua e diz usar ModARK "se tiver". A sugestão implementada é `(nível × 5 + INT final) × máximo(1, ModARK)`. Há substituição manual do máximo para a decisão da mesa.
- Há dados raciais de HP, mas não uma fórmula completa de geração e progressão. O HP máximo é registrado manualmente com observação do cálculo.
- O aprendizado usa uma quantidade de d20 igual a um modificador, mas o livro não define o procedimento para modificadores nulos ou negativos. Esta entrega registra o aprendizado e suas ordens, sem automatizar essa decisão.

O limite técnico de nível da ficha nesta entrega é 100, e o limite de 300 registros por seção/1.000 itens existe para limitar tamanho de requisição. Esses limites de implementação não são apresentados como regras de progressão do livro.

## Dados e permissões

`src/systems/arkanis` contém o módulo, seus tipos, cálculos e componentes próprios. O discriminador de dados é `system: arkanis`, versão de formato 1. A ficha usa `characters.system_data`, mas não armazena aptidões de nível 3 na tabela de perícias de D&D, cujo limite continua sendo 2. Atributos de Arkanis também não são convertidos em atributos de D&D.

O inventário usa `character_inventory`, com RLS, para conservar as entregas e as permissões existentes. O identificador `ingredient_id` liga o objeto ao catálogo; a tag `ingredientes` identifica os materiais disponíveis para a próxima etapa. Registros de quantidade zero não são consumidos nem removidos pela bancada.

`save_arkanis_character` confere a campanha, a versão esperada, o vínculo e a validade da ficha e grava ficha e inventário na mesma transação. Uma falha reverte a operação. O catálogo de ingredientes é somente leitura para usuários comuns. Funções auxiliares ficam privadas. A migração é reaplicável.

## Próxima etapa

A implementação de receitas, compatibilidade entre ingredientes, testes de preparo, resultados, balanceamento e consumo ainda depende das regras que serão fornecidas. Nenhum desses comportamentos foi adicionado como se já estivesse definido. Combate automatizado de Arkanis também não foi inferido das automações de D&D; nesta entrega, suas consequências são resolvidas pelo mestre e anotadas na ficha.
