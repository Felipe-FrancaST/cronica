# Classes, raças e magias — D&D 5e de 2014

Esta atualização mantém a edição de 2014 do projeto e do PDF fornecido. O VTT 3D e seus dados continuam disponíveis.

## Catálogo incluído

- **13 classes oficiais:** Artífice, Bárbaro, Bardo, Bruxo, Clérigo, Druida, Feiticeiro, Guerreiro, Ladino, Mago, Monge, Paladino e Patrulheiro.
- **112 opções de raça, linhagem e variante**, identificadas por fonte. Cobrem o Livro do Jogador de 2014, Monsters of the Multiverse e opções de Eberron, Ravnica, Theros, Strixhaven, Ravenloft, Spelljammer, Dragonlance, Fizban, Wildemount, Sword Coast, Volo, Mordenkainen, Acquisitions Incorporated, Grung, Locathah e Tasha. Nove opções de Plane Shift estão marcadas como suplementos opcionais. É possível registrar uma raça personalizada.
- **361 entradas do PDF:** 27 truques e 334 magias dos círculos 1–9. O catálogo preserva nomes em português/inglês, escola, tempo de lançamento, alcance, componentes, duração, concentração, ritual, descrição e página de origem.
- As oito listas de classe do PDF foram importadas. **73 magias existentes no PDF** também recebem vínculo com o Artífice de Tasha. O PDF é de 2015 e não contém as magias adicionais de livros posteriores; elas podem ser acrescentadas posteriormente ao catálogo.

O total de raças inclui variantes e linhagens. As regras de 2024/5.5e, classes de parceiros como Blood Hunter, homebrew e todas as revisões históricas de uma mesma raça não são misturadas com esta base de 2014. Os traços de raça apresentados são referências resumidas; os textos integrais de livros não fornecidos não foram importados.

A fonte das magias é `dd-5e-lista-de-magias-biblioteca-elfica.pdf`, Lista de Magias D&D 5 v1.4, diagramação BigGod e tradução Apollo C. O documento possui 79 páginas. A página física do PDF e o número de referência impresso são conservados separadamente.

## Usar na aplicação

O menu **Compêndio D&D** permite consultar magias, classes e raças. As magias podem ser filtradas por nome português/inglês, classe, círculo, escola, ritual e concentração. A busca aceita nomes sem acentos.

Na ficha, escolha raça, classe e nível em **Identidade**. Guerreiro e Ladino possuem uma opção de conjuração para **Cavaleiro Arcano** e **Trapaceiro Arcano**, respectivamente. Suas listas utilizam as magias de Mago; a seleção de escolas e exceções concedidas pela subclasse continua a cargo da mesa.

Na aba **Magias**, abra o catálogo, escolha uma entrada e clique em **Adicionar à ficha**. A lista começa filtrada pela classe e pelos círculos disponíveis; é possível ampliar os filtros para registrar magias de habilidades ou futuros níveis. Magias de outras listas são identificadas como provenientes de raça, talento ou habilidade. Duplicatas do mesmo catálogo são impedidas.

O grimório é agrupado por círculo. Classes que conhecem magias recebem novas entradas marcadas como conhecidas. Nas classes que preparam, marque a seleção do dia. Magias sempre preparadas ou concedidas por outras habilidades podem ser marcadas como extras. Os limites básicos de truques e preparação/conhecimento são mostrados como orientação, permitindo exceções da mesa.

**Conjurar** consome o recurso escolhido. Uma magia pode usar um espaço de círculo superior. Truques não consomem espaços. Rituais não gastam espaços quando a classe possui conjuração ritual e os requisitos básicos de disponibilidade e preparação/conhecimento são atendidos; Magos podem consultar rituais no grimório sem prepará-los. O texto da magia informa os efeitos de uso em círculos superiores.

**Descanso curto** recupera espaços de pacto. **Descanso longo** recupera espaços comuns, pacto e Arcanos Místicos. Esses botões recuperam recursos mágicos; não simulam cura, alimentação, oito horas de descanso ou recuperação de outras habilidades. Contadores, conjurações, descansos e escolhas ficam no rascunho até clicar em **Salvar ficha**. Cancelar descarta as mudanças.

NPCs também têm seletor completo de raça, sugestões de classe e acesso ao catálogo de magias. Seus blocos de estatísticas e recursos são preenchidos manualmente pelo mestre. Campos de referência importados ficam protegidos; observações podem ser registradas nas anotações da magia. Magias personalizadas continuam editáveis.

## Cálculos implementados

| Tipo                                     | Progressão de espaços e recuperação                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Bardo, Clérigo, Druida, Feiticeiro, Mago | Conjuração completa, níveis 1–20; descanso longo                                                |
| Paladino, Patrulheiro                    | Conjuração parcial a partir do nível 2; descanso longo                                          |
| Artífice                                 | Conjuração a partir do nível 1; progressão própria de meia conjuração; descanso longo           |
| Cavaleiro Arcano, Trapaceiro Arcano      | Tabela própria de um terço de conjurador a partir do nível 3; descanso longo                    |
| Bruxo                                    | 1–4 espaços de pacto, todos do mesmo círculo, limitado ao 5º; descanso curto ou longo           |
| Arcanos Místicos do Bruxo                | Uma magia e um uso por círculo 6, 7, 8, 9, adquiridos nos níveis 11, 13, 15, 17; descanso longo |

CD e ataque mágico usam o atributo correto da classe, incluindo Inteligência nas duas subclasses arcanas. Preparação usa nível e atributo de conjuração, ou metade do nível arredondada para baixo em Paladino/Artífice. Os limites básicos de magias conhecidas e truques seguem as tabelas de 2014.

O deslocamento racial é aplicado à ficha e considera as melhorias básicas de Bárbaro e Monge e suas restrições de armadura. Também são calculados: armadura natural de Tortle, Homem-lagarto, Locathah, Loxodon, Autognomo e Thri-kreen; +1 de CA do Forjado bélico; e PV adicionais do Anão da colina. Fórmulas de CA alternativas não são somadas. Máximos de PV e deslocamento personalizados continuam prevalecendo sobre o cálculo automático.

Atributos incluem os bônus raciais e melhorias escolhidos pelo jogador: não são redistribuídos automaticamente ao trocar a raça. Visão no escuro, tamanho e nomes dos traços aparecem como referência. Talentos, magias de domínio/juramento, poderes raciais, outras subclasses, multiclasse, Recuperação Arcana, pontos de feitiçaria, invocações e exceções especiais continuam nos campos de habilidades/ajustes. Conjurar controla recursos; não rola dano nem aplica efeitos automaticamente aos tokens do VTT.

Ao reduzir o nível, espaços inacessíveis deixam de aparecer e os usos são ajustados aos novos máximos. Magias são preservadas no grimório; Arcanos Místicos que ainda não estão disponíveis deixam de usar esse modo de conjuração.

## Migrar o Supabase

### Banco já instalado com as migrações 001–007

1. Faça uma cópia dos dados antes da atualização.
2. Pela CLI vinculada ao projeto, execute `npx supabase db push`; ou execute **somente** `supabase/migrations/202610040008_dnd_catalog.sql` no SQL Editor, uma vez.
3. Atualize os arquivos do site e recarregue as fichas abertas.
4. Confira o compêndio, uma ficha de conjurador e uma ficha de Bruxo.

Não execute `supabase/schema.sql` em um banco já instalado: ele contém a instalação completa, incluindo as sete migrações anteriores.

### Banco novo

Use `npx supabase db push` em um projeto vinculado, ou execute `supabase/schema.sql` uma vez no SQL Editor. O esquema completo agora reúne oito migrações. Configure Auth, Storage e as variáveis do `.env.example` conforme o README.

Nenhuma migração foi executada em um projeto remoto durante esta entrega. O pacote contém o SQL preparado e validado em PostgreSQL local.

### Dados e autorização

| Relação                                    | Conteúdo                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `dnd_classes`                              | Classe, dado de vida, tipo/atributo de conjuração, preparação e fonte  |
| `dnd_races`                                | Raça/variante, deslocamento, fonte, traços e metadados                 |
| `dnd_spells`                               | Dados completos e referência de cada magia                             |
| `dnd_spell_classes`                        | Vínculos muitos-para-muitos entre magia e classe, com fonte            |
| `dnd_spell_progression`                    | 300 combinações de classe/subclasse e nível, incluindo pacto e arcana  |
| `character_spells.catalog_id` / `class_id` | Referências relacionais calculadas a partir dos dados da magia         |
| `npc_spells.catalog_id`                    | Referência da magia de catálogo no NPC                                 |
| `characters.system_data`                   | Raça, classe, nível, preparação e contadores de recursos               |
| `dnd_character_casting`                    | Visão das progressões/recursos das fichas que o usuário pode consultar |

O catálogo é legível por contas autenticadas e não pode ser alterado pelo cliente comum. Contadores são conferidos no servidor antes de salvar. Referências inválidas, círculos incompatíveis, duplicatas e Arcanos Místicos indisponíveis são rejeitados. A gravação continua na transação de `save_character`, com RLS e controle de versão da ficha. A visão usa `security_invoker`, preservando a privacidade das fichas.

A migração mantém os IDs de personagens, itens e magias antigas. Para Bruxos, migra `slots_used[círculo]` para `pact_slots_used`, preservando gastos válidos. Contadores antigos inválidos são limitados à faixa permitida, e o valor anterior fica em `system_data.resource_migration_backup`. Fichas antigas com uma classe/nível fora do catálogo são preservadas para correção manual.

Na demonstração, o catálogo incluído funciona sem banco. Na versão conectada, as magias são carregadas do Supabase com paginação; se o catálogo estiver indisponível, a referência local continua disponível com indicação na interface. As credenciais administrativas permanecem fora do código do navegador.

## Manutenção do catálogo

Os arquivos `src/systems/dnd5e/data/classes.json`, `races.json` e `spells.json` são a fonte versionada dos catálogos iniciais. Para reextrair o PDF original:

```bash
python -m pip install pymupdf
python scripts/import-spells.py CAMINHO_DO_PDF
node scripts/complete-spell-catalog.mjs
```

A importação utiliza as caixas desenhadas no PDF para separar as duas colunas e mantém continuações de descrições. `docs/spell-import-report.json` registra hash, contagem, vínculos e inconsistências. Foram conciliadas diferenças de grafia do índice/apêndice, como Telecinese/Telecinésia e Reecarnação/Reencarnação. A anotação “Aprisionar Alma (não aparece no livro)” não foi criada como magia; o documento contém 361 descrições reais.

Depois de alterar dados ou regras, gere a migração **antes de sua primeira aplicação**:

```bash
node --import tsx scripts/generate-dnd-migration.ts
```

Após uma migração já ter sido aplicada, registre mudanças em uma nova migração: não reexecute a 008 e não substitua o histórico existente. Novas magias no Supabase precisam de todos os metadados e vínculos de classe; o servidor preserva seus dados canônicos nas fichas.

## Validação

Validação desta entrega: **54 testes de regras/SQL, 8 fluxos gerais de navegador e 10 fluxos do VTT passaram** (72 no total), além da compilação de produção e verificação de TypeScript.

Os testes abrangem completude do PDF, busca, limites por classe/subclasse, consumo, círculos superiores, rituais, descansos, Arcana, migração de fichas antigas, limites no PostgreSQL, referências relacionais, rollback, RLS e fluxos de navegador em desktop/celular. Há capturas de exemplo em `docs/dnd-*.png`. Consulte o README para os comandos; a integração com o projeto remoto deve ser conferida após executar a migração.

Referências das regras e fontes:

- [Classes e tabelas de 2014 — D&D Beyond](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes)
- [Índice oficial de raças/espécies — D&D Beyond](https://www.dndbeyond.com/species) (o índice reúne edições distintas; este catálogo usa a base de 2014)
- [Artificer 101 — D&D Beyond](https://www.dndbeyond.com/posts/854-artificer-101-a-beginners-guide-to-making-magical)
- [Magias de Artífice — D&D Beyond](https://www.dndbeyond.com/spells/class/252717-artificer)
- [RLS e visões — Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
