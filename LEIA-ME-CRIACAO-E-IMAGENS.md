# Criação de personagens e ajuste de imagens — atualização 036

Esta atualização segue o **Livro do Jogador de D&D 5e de 2014**, a edição usada na ficha existente. O Artífice continua disponível com suas quatro especializações de _Tasha's Cauldron of Everything_ (2020). As opções de 2024 não foram misturadas às de 2014.

## Instalar no site existente

1. Se seu banco já está na **035**, execute `supabase/migrations/202610220036_character_creation_and_book_options.sql` no SQL Editor do Supabase. Em bases anteriores, aplique primeiro somente as migrações ausentes, em ordem.
2. Substitua o código do projeto pelo conteúdo da pasta `rpg-cronica`, mantendo seu `.env.local` e as variáveis já configuradas na hospedagem.
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`; faça um novo deploy.
4. Recarregue as abas do mestre e dos jogadores.

A migração atualiza o catálogo de escolhas e a validação no servidor. Sem ela, a interface nova poderá oferecer opções que um banco antigo ainda recusa. As migrações **001–035 foram preservadas**. A 036 é transacional, pode ser reaplicada e não reescreve personagens ou inventários existentes. `supabase/schema.sql` serve exclusivamente para instalações novas.

Não há novas credenciais ou variáveis de ambiente para esta funcionalidade.

### Se apareceu “Query is too large to be run via the SQL Editor”

Use a versão compacta do SQL **036** deste pacote, com aproximadamente **233 KB**. Abra **SQL Editor → New query**, cole somente o conteúdo completo desse arquivo e execute. O arquivo continua sendo a migração 036; não é preciso executar a 001 novamente ou colar o `schema.sql`.

A versão compacta reconstrói no PostgreSQL os valores que antes eram repetidos em cada nível, terreno e combinação de equipamento. Ela mantém o mesmo catálogo, as mesmas permissões e a transação de atualização. Pode ser aplicada tanto em uma base que já chegou à 035 quanto em uma base que já executou a 036 anterior. Esta correção altera somente a instalação do banco; depois de aplicá-la, recarregue o site.

## Ajustar uma imagem

Ao escolher um JPG, PNG ou WebP, aparece **Ajustar imagem**. Arraste com mouse ou toque, use as setas do teclado ou os controles de posição. O zoom aproxima a região desejada; **Girar 90°** corrige a orientação.

A moldura mostra o arquivo final. O restante fica escurecido. Em avatares e retratos, o círculo indica a apresentação do avatar/token dentro do arquivo quadrado. **Usar este recorte** prepara a imagem; ela só é enviada ao salvar o formulário principal. **Cancelar ajuste** preserva a seleção anterior. É possível reabrir **Ajustar recorte** e também **Ajustar imagem atual** em arquivos já salvos.

| Local                                | Recorte                              |
| ------------------------------------ | ------------------------------------ |
| Perfil, personagem e NPC             | Quadrado com guia circular           |
| Campanha, capítulo e locais do mundo | Horizontal, 16:9                     |
| Item                                 | Quadrado                             |
| Cartão do mural                      | Horizontal, 16:10                    |
| Imagem de fundo do grid              | Original, quadrado, 16:9, 4:3 ou 3:4 |

Os envios comuns aceitam originais de até 5 MB; o fundo do grid aceita até 25 MB para edição. O resultado respeita o limite de 5 MB do armazenamento, preserva transparência e limita a resolução a 2048 pixels no maior lado, ou 4096 no fundo do grid. Não há alteração da permissão de quem pode editar cada registro.

## Antecedentes e equipamento inicial

**Identidade → Antecedente** e **Criação assistida → Escolher antecedente** usam a mesma seleção. Há os 13 antecedentes do Livro do Jogador, as variantes Espião, Gladiador, Mercador de Guilda, Cavaleiro e Pirata, além do antecedente personalizado. A escolha preenche os benefícios e permite configurar perícias, idiomas e ferramentas. Os atributos de personagens existentes são preservados ao selecionar uma origem.

Em **Criação assistida → Equipamento inicial**, cada alternativa pode ser escolhida separadamente: arma principal, arma adicional, armadura, foco/componentes, instrumento e pacote, conforme a classe. Escolhas como duas armas marciais permitem selecionar cada arma, inclusive duas iguais. Os pacotes são expandidos nos itens e quantidades correspondentes; a prévia permite conferir o conjunto antes de aplicar.

O equipamento e as moedas do antecedente são adicionados uma vez, sem apagar o inventário anterior. A primeira armadura e o escudo são equipados quando o personagem não usa outros. A multiclasse não concede outro equipamento inicial. As opções condicionais, como armadura ou arma que exige proficiência, vêm identificadas na seleção; confira os treinamentos concedidos pela raça e pela especialização da mesa.

## Classe e especialização

| Classe      | Nome da escolha            | Opções cadastradas                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Bárbaro     | Caminho Primitivo          | Berserker; Guerreiro Totêmico                                                                 |
| Bardo       | Colégio de Bardo           | Conhecimento; Bravura                                                                         |
| Clérigo     | Domínio Divino             | Conhecimento; Vida; Luz; Natureza; Tempestade; Enganação; Guerra                              |
| Druida      | Círculo Druídico           | Terra; Lua                                                                                    |
| Guerreiro   | Arquétipo Marcial          | Campeão; Mestre de Batalha; Cavaleiro Arcano                                                  |
| Monge       | Tradição Monástica         | Mão Aberta; Sombras; Quatro Elementos                                                         |
| Paladino    | Juramento Sagrado          | Devoção; Anciões; Vingança                                                                    |
| Patrulheiro | Arquétipo de Patrulheiro   | Caçador; Mestre das Bestas                                                                    |
| Ladino      | Arquétipo de Ladino        | Ladrão; Assassino; Trapaceiro Arcano                                                          |
| Feiticeiro  | Origem de Feitiçaria       | Linhagem Dracônica; Magia Selvagem                                                            |
| Bruxo       | Patrono Transcendental     | Ínfero; Arquifada; Grande Antigo                                                              |
| Mago        | Tradição Arcana            | Abjuração; Adivinhação; Conjuração; Encantamento; Evocação; Ilusão; Necromancia; Transmutação |
| Artífice    | Especialização de Artífice | Alquimista; Armeiro; Artilheiro; Ferreiro de Batalha                                          |

O mago escolhe a **Tradição Arcana no nível 2**. Os demais níveis de escolha seguem cada classe. A ficha, a progressão e o compêndio passam a usar o termo correspondente. Há escolhas específicas para totens, manobras, disciplinas elementais, conhecimentos, idioma e modelo da armadura arcana. Habilidades posteriores do Cavaleiro Arcano e do Trapaceiro Arcano também foram acrescentadas.

Magias de domínio, juramento e especialização do Artífice são oferecidas de acordo com o nível. Listas expandidas de patronos do Bruxo ampliam a seleção; não concedem automaticamente magias conhecidas. Ataque Extra do Bardo da Bravura e dos Artífices correspondentes não se acumula com outra classe.

As descrições são resumos próprios de consulta. Efeitos que exigem arbitragem, criaturas companheiras, surtos de Magia Selvagem e certas características permanecem sob condução do mestre; cadastrar todas as especializações não significa executar automaticamente cada regra de cada livro. As opções personalizadas e as fichas anteriores continuam disponíveis.

## Verificação

Os testes cobrem o catálogo, níveis de escolha, recursos, idiomas/ferramentas, alternativas de equipamento, quantidades, aplicação única, persistência no PostgreSQL e reaplicação da migração. Os testes de navegador verificam criação pelo jogador, recorte no computador e celular, cancelamento, reajuste e correspondência entre a área da prévia e os pixels salvos. A exportação da ficha PDF continua disponível.

Para executar os testes novos de interface: `npm run test:creation-media`. Consulte também [as fontes](docs/fontes-dnd-v16.md).
