# Regras do mestre e oficina de cenários — atualização 019

## Controles de campanha

O dono da campanha acessa **Regras**. Jogadores não recebem esse menu e não podem abrir o formulário pelo endereço direto. O banco também verifica o dono ao salvar as opções.

| Regra | Efeito |
| --- | --- |
| Permitir multiclasse | Libera novas combinações. Ao desativar, fichas existentes mantêm suas classes e podem evoluir nelas. |
| PV por média fixa | Preserva o cálculo anterior: dado cheio no primeiro nível do personagem e média fixa nos demais. |
| PV por dado cheio | Usa o máximo do dado correspondente a cada classe, em todos os níveis. |
| PV por rolagem | O primeiro nível da classe inicial continua cheio. Os demais guardam um resultado por classe e nível; Constituição e bônus são aplicados no cálculo. |
| Método de atributos | Escolha livre, conjunto padrão, compra de 27 pontos, 4d6 ou manual. Aplica-se a novos personagens; distribuições antigas são preservadas. |
| Descanso dos jogadores | Controla a recuperação manual de espaços de magia, dados de vida e usos de habilidades. O mestre pode registrar a recuperação; ações de combate continuam aplicando seus efeitos. |
| Itens personalizados | Controla novas entradas fora do catálogo. Itens existentes e equipamento inicial continuam funcionando. |

Os controles anteriores de nível do grupo, criação/edição de fichas, encerramento de turno, movimento e consumo de ações continuam disponíveis.

### Rolagem e preservação dos PV

Na ficha, abra **Combate → Pontos de vida por nível**. Use **Rolar dados de vida pendentes** antes de salvar. O banco registra o resultado e retorna o mesmo valor nas tentativas seguintes, inclusive ao baixar e subir o nível. Resultados arbitrários enviados pela ficha são rejeitados. O ganho mínimo por nível após Constituição é de 1 PV.

Ao mudar uma campanha existente para rolagem, o banco registra uma vez os níveis atuais sem resultado. Alterar a regra recalcula os máximos e limita PV atuais ao novo máximo, sem conceder cura. Exceções de PV máximos já existentes são preservadas; novos ajustes personalizados em modo dado cheio/rolagem ficam sob controle do mestre. NPCs mantêm seus ajustes próprios.

## Oficina de cenários

Encerre o combate, abra **Mesa → Grid → Cenário** e clique em **Editar grid**. Clicar em um controle bloqueado mostra a instrução correspondente. Durante o combate, o mestre ainda pode revelar áreas ocultas.

O editor oferece 46 elementos e 95 variantes adicionais, organizados em Natureza, Construções, Interiores, Caminhos e Perigos e magia. A busca encontra nomes com ou sem acentos. A prévia mostra a peça em 2D antes de colocar.

As casas têm fundações, telhados inclinados, madeiramento, portas e janelas. Além de chalé, estalagem e torre, há casa enxaimel, casa de pedra, solar, casa do deserto e casa abandonada. Tavernas podem ser comuns, de porto, de pedra ou abertas para representar o interior. Forjas e estábulos também têm versões abertas/cobertas.

### Compor um mapa

- **Vila:** escolha Vila acolhedora; combine casas, taverna, fonte, feira, poço e estradas. Casas começam com 3 × 3 células e tavernas com 4 × 3; ajuste a ocupação se necessário.
- **Interior:** coloque pisos, paredes e passagens; acrescente tapetes, mesas, cadeiras, balcão, camas, estantes e escadas. A taverna aberta permite ver mesas e balcão por cima.
- **Porto:** use Vila do porto com tavernas do porto, barcos, pontes, água e caixas.
- **Ruínas:** combine casa abandonada, muros baixos, ruínas, vegetação e Fortaleza sombria.

Cada peça guarda seu estilo: materiais originais, vila acolhedora, floresta, porto, deserto, inverno ou fortaleza sombria. A paleta combina madeira, paredes, telhado, pedra e tecidos. Cores personalizadas continuam disponíveis; **Cor padrão** remove a cor individual e deixa a paleta escolhida. **Materiais originais** recupera os materiais padrão da peça. Selecione um objeto, altere sua aparência e use **Aplicar alterações** para salvar.

### Ocupação e desempenho

A ocupação permanece retangular e em células. Rotação é visual; bloqueio de deslocamento e custo do terreno são independentes da aparência. Pisos, tapetes e passagens começam passáveis, paredes e construções começam bloqueadas, e escadas começam com custo 2. Feche uma passagem ativando seu bloqueio. Ocultação e portais seguem as regras existentes.

Os modelos são procedurais e não baixam imagens ou modelos externos. Detalhes estáticos são unidos por material, e peças repetidas usam instâncias em 3D. A quantidade de chamadas de desenho de 100 casas do mesmo tipo/variante/estilo permanece igual à de uma casa; estilos e variantes diferentes formam seus próprios grupos. A qualidade reduzida e o modo 2D continuam disponíveis.

## Aplicação

Execute somente `supabase/migrations/202610070019_master_rules_and_scene_workshop.sql` na instalação já atualizada até a 018 e publique o código. Os SQLs anteriores permanecem intactos. Os testes automatizados usam PostgreSQL local e uma API de navegador isolada; não acessam a campanha em produção.
