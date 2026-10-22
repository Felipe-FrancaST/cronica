# Crônica RPG

Plataforma de campanhas de RPG em português, com Next.js, React, TypeScript, Tailwind CSS, Three.js e Supabase. Preparada para a Vercel.

**SQL 036 corrigido para o editor do Supabase:** esta versão reduz o arquivo para aproximadamente 233 KB, mantendo o mesmo catálogo e as mesmas regras. Se apareceu “Query is too large to be run via the SQL Editor”, execute somente a 036 deste pacote em uma consulta nova. Veja [o procedimento](LEIA-ME-CRIACAO-E-IMAGENS.md).

**Atualização 036 — criação e imagens:** mestre e jogador podem ajustar o recorte com moldura, zoom, movimento e rotação. A criação passa a oferecer os 13 antecedentes do Livro do Jogador de 2014, suas cinco variantes, equipamento inicial por alternativas e as 40 especializações do livro, além das quatro de Artífice já compatível com a ficha. O nome e as escolhas se adaptam à classe; o mago escolhe uma **Tradição Arcana**. Se o banco já está na 035, aplique a **036** e publique o novo código. Veja [o guia da criação e das imagens](LEIA-ME-CRIACAO-E-IMAGENS.md).

**Exportação da ficha em PDF:** depois de salvar o personagem, abra sua ficha e escolha **Exportar PDF**. O arquivo usa o modelo editável fornecido, preenche os dados do personagem e acrescenta páginas para textos longos, inventário e magias completos. Novos campos opcionais completam a identificação e a história. Atualize o código, execute `npm ci` e faça novo deploy; esta funcionalidade não exige SQL novo. Veja [o guia da ficha PDF](LEIA-ME-FICHA-PDF.md).

A correção **035** resolve o erro `new row violates row-level security policy for table "campaigns"` ao criar campanhas. Se a base já está na **034**, execute somente `supabase/migrations/202610220035_campaign_creation_rls_fix.sql` e recarregue o site. A correção funciona com o código já publicado. Veja [a causa e as instruções](LEIA-ME-CORRECAO-CAMPANHAS.md).

A atualização **034** acrescenta a **Oficina de mapas do mestre**, com oito modelos, pintura de 22 terrenos e relevo, símbolos, tokens, rotas, regiões, textos, camadas, rascunhos e exportação. Os mapas podem virar cenários da Mesa. Se a base já está na **033**, aplique somente `supabase/migrations/202610220034_campaign_map_workshop.sql` e faça novo deploy. As migrações 001–033 foram preservadas. Veja [o guia da oficina](LEIA-ME-OFICINA-DE-MAPAS.md).

A atualização **033** melhora a sincronização dos dados e amplia **Configurações** com leitura ampliada, movimento reduzido, cards compactos, visualização 2D/3D, qualidade gráfica e animação dos dados. As preferências são gravadas na conta sem sobrescrever campos alterados em outra aba. A administração também protege consultas e gravações simultâneas. Se o banco já está na **032**, aplique somente `supabase/migrations/202610210033_profile_preferences.sql` e faça novo deploy. Veja [a revisão e as novas configurações](LEIA-ME-REVISAO-E-CONFIGURACOES.md).

A atualização anterior **032** acrescenta **Pix com QR Code e código copia e cola**, confirmação de pagamento e renovação manual pelo período do plano. A opção recorrente continua disponível. Se seu banco ainda está na **031**, execute a 032 e depois a 033 e a 034 antes de publicar este pacote. Consulte [o guia do Pix](LEIA-ME-PIX.md).

A revisão anterior da conferência de pagamentos tratou o erro **`provider_400`**: buscas sem paginação fixa, tratamento de páginas do provedor, continuação da conferência após falhas isoladas e identificação da consulta recusada. Essa revisão anterior alterou somente o código; o Pix descrito acima acrescenta a migração 032. Depois use **Conferir pagamento** na contratação existente. Consulte [o guia da confirmação de pagamentos](LEIA-ME-CONFIRMACAO-PAGAMENTO.md).

A correção **031** resolve `column "requested_by" does not exist` ao excluir contas em bancos com registros históricos de outra estrutura. Se a **030 já está instalada**, execute **somente** `supabase/migrations/202610180031_account_deletion_legacy_attribution.sql` no Supabase e retome a exclusão em Configurações. Veja [o guia de conta e pagamentos](LEIA-ME-CONTA-E-PAGAMENTOS.md).

A atualização **030** acrescenta **Configurações → Excluir minha conta**, com confirmação por senha, cancelamento da renovação e remoção de dados e arquivos. Também reforça a recuperação de falhas de pagamento e a confirmação do preço. Se seu banco já está na **029**, aplique as migrações **030 e 031** e publique o código atualizado. Veja [o guia de conta e pagamentos](LEIA-ME-CONTA-E-PAGAMENTOS.md).

As assinaturas mensais pelo **Mercado Pago** estão preparadas: o padrão é **R$ 20,00 para mestres**, com jogadores gratuitos. A área **Administração** gerencia planos, contas, cortesias, relatórios financeiros e regras de cobrança. **Aplique as migrações 029 a 032 em ordem** e configure as credenciais do servidor para ativar pagamentos. Veja [o guia de assinaturas e administração](LEIA-ME-ASSINATURAS.md).

As **pilhas de tesouro e os recipientes** agora aceitam cobre, prata, electro, ouro e platina, junto com um item opcional. A coleta atualiza a ficha do personagem uma única vez. Plantas, estantes, barris e outros objetos também podem oferecer recursos; inscrições revelam pistas, e alavancas, placas de pressão e gongos controlam uma passagem ou luz do mapa. Configure tudo em **Cenário → Interações**. Veja [moedas e mecanismos](LEIA-ME-MOEDAS-E-INTERACOES.md). **Aplique a migração 028** depois da 027.

O **painel do mestre** agora abre uma ferramenta por vez: **Objetos**, **Interações**, **Terreno**, **Luz e visão**, **Participantes** e **Regras da mesa**. A câmera fica recolhida; biblioteca, ajustes e peças colocadas têm suas próprias abas. As buscas e a paginação evitam listas enormes e barras internas de rolagem. Voltar ao menu ou trocar de painel interrompe o pincel e preserva os ajustes. Veja [o novo painel do mestre](LEIA-ME-PAINEL-DO-MESTRE.md).

As interações do mestre agora atualizam o elemento imediatamente e confirmam o resultado com o servidor, sem recarregar toda a mesa. Só o elemento em salvamento fica bloqueado; se houver erro, sua alteração é revertida. O Grid reutiliza os cálculos de movimento quando muda apenas uma luz e preserva os modelos 3D de outras regiões do mapa. Abrir/fechar recipientes também aproveita a resposta recebida. Consulte [as melhorias e a medição de desempenho](LEIA-ME-DESEMPENHO-GRID.md).

As **Interações** ficam dentro do menu de ferramentas e podem ser fechadas com **Ferramentas** ou Escape. Em 2D e 3D, tocar em um elemento mostra **Mover** e **Excluir** com a edição ativa; fora da edição, mostra **Interagir**. Para mover, escolha a ação e toque na célula de destino, ou cancele para manter a posição. A mudança preserva o conteúdo, a chave e a identidade do elemento.

A correção **027** resolve o erro de datas vazias ao salvar itens em baús e recipientes. Também reorganiza **Interações do cenário** em cartões responsivos, com botões que cabem no painel e sem rolagem interna na lista. Se já instalou a 026, aplique 027 a 031 em ordem e atualize o código; consulte [as instruções de atualização](LEIA-ME-ATUALIZACAO.md).

Esta revisão melhora as luzes do Grid e conecta **baús, chaves e recompensas** à seção Itens. O mestre configura o conteúdo e a fechadura ao colocar um recipiente, escolhe o nome da chave gerada automaticamente e entrega essa chave pelo catálogo. O jogador interage perto do elemento, abre com a chave correta e recolhe o item uma única vez. Há avisos de baú/porta trancados, ajustes de alcance, cor e intensidade das luzes e oito novos elementos, totalizando **70 peças**. Consulte [o guia das luzes e interações](LEIA-ME-LUZES-BAUS-E-CHAVES.md).

A oficina de itens, funções, cargas, áreas, bônus passivos, sintonização e notas secretas continua integrada ao inventário e à Mesa. As melhorias de fluidez, peças de masmorra, favoritos e bloqueios independentes de movimento e visão também estão incluídas. Consulte [o guia dos itens](LEIA-ME-ITENS-DA-CAMPANHA.md), [o guia do Grid](LEIA-ME-FLUIDEZ-E-MASMORRAS.md) e [as instruções de atualização](LEIA-ME-ATUALIZACAO.md).

## Executar localmente

Use Node.js 22 ou superior. Abra a pasta `rpg-cronica`, onde está o `package.json`:

```bash
npm ci
```

Mantenha seu `.env.local` atual. Para uma instalação local nova, copie `.env.example` para `.env.local` e preencha:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_OU_PUBLISHABLE
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_DEMO=false
```

Use a chave pública anon/publishable nessas variáveis. As operações seguem a sessão autenticada e as políticas RLS. `.env.local` e arquivos gerados não fazem parte do pacote para o repositório.

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Para uma demonstração local, deixe as variáveis Supabase vazias e use `NEXT_PUBLIC_ENABLE_DEMO=true`. Os exemplos ficam no navegador; o Grid compartilhado exige uma campanha no Supabase. Com o Supabase configurado, a aplicação usa a autenticação e o banco reais. Em produção, mantenha a demonstração desativada.

## Atualizar o site existente

1. Substitua os arquivos do projeto pela pasta deste pacote, preservando seu `.env.local`.
2. Se o banco está na **035**, execute somente `supabase/migrations/202610220036_character_creation_and_book_options.sql`. Se está na **034**, execute a 035 e depois a 036. Em bases anteriores, aplique as migrações ausentes em ordem até a **036**, seguindo [a ordem de atualização](LEIA-ME-ATUALIZACAO.md). Conclua [a configuração de assinaturas e administração](LEIA-ME-ASSINATURAS.md).
3. Execute `npm ci` e `npm run build`.
4. Envie o código pelo processo que já utiliza. Mantenha o projeto Vercel, as variáveis e as URLs autorizadas no Supabase.
5. Recarregue as abas do mestre e dos jogadores.

As 36 migrações estão incluídas. A aplicação não executa SQL automaticamente. Para uma instalação nova, use as migrações em ordem ou o `supabase/schema.sql` atualizado. Em um banco existente, aplique somente os arquivos indicados nas instruções de atualização; o export completo é exclusivo para um banco novo.

Na Vercel, a pasta raiz continua sendo a que contém `package.json`: instalação `npm ci`, build `npm run build`, framework Next.js. As configurações existentes de Auth, Storage, Realtime e hospedagem continuam válidas.

## Funcionalidades e guias

- Recorte de imagens, antecedentes, equipamento e especializações: [guia da atualização 036](LEIA-ME-CRIACAO-E-IMAGENS.md).

- Ficha editável preenchida e exportada pelo jogador: [guia da exportação PDF](LEIA-ME-FICHA-PDF.md).

- Correção da criação de campanhas: [guia da atualização 035](LEIA-ME-CORRECAO-CAMPANHAS.md).
- Oficina de mapas: [guia da atualização 034](LEIA-ME-OFICINA-DE-MAPAS.md).
- Configurações pessoais, sincronização e revisão: [guia da atualização 033](LEIA-ME-REVISAO-E-CONFIGURACOES.md).

- Pix e renovação manual: [guia da atualização 032](LEIA-ME-PIX.md).
- Exclusão de conta e revisão dos pagamentos: [guia da atualização 030](LEIA-ME-CONTA-E-PAGAMENTOS.md).
- Assinaturas Mercado Pago, administração, planos e financeiro: [guia da atualização 029](LEIA-ME-ASSINATURAS.md).

- Moedas em tesouros e recipientes, coleta de recursos, pistas e mecanismos vinculados: [guia da atualização 028](LEIA-ME-MOEDAS-E-INTERACOES.md).

- Luzes, baús, portas com chaves e novas interações: [guia da atualização 026](LEIA-ME-LUZES-BAUS-E-CHAVES.md).
- Oficina de itens, funções, cargas, bônus e entregas: [guia da atualização 025](LEIA-ME-ITENS-DA-CAMPANHA.md).
- Fluidez, peças de masmorra e interações durante o combate: [guia da atualização 024](LEIA-ME-FLUIDEZ-E-MASMORRAS.md).
- Superfícies contínuas, dia/noite e exclusão de sessões: [guia da atualização 021](docs/iluminacao-e-sessoes-v21.md).

- Campanhas, modos Mestre/Jogador, membros por email de conta existente, perfis e preferências.
- Fichas D&D 5e de 2014, criação assistida, multiclasse, caminhos e antecedentes: [guia de personagens](docs/multiclasse-e-criacao-v16.md).
- Compêndio com 13 classes, 112 raças/variantes, 361 magias/truques e 89 itens; seleção de magias, inventário e habilidades: [guia de magias, combate e itens](docs/magias-combate-e-itens-v17.md).
- Mundo, regiões, cidades, locais, NPCs, imagens privadas e notas do mestre.
- Sessões, histórico, encerramento, arquivo e regras de campanha: [guia de sessões](docs/sessoes-e-regras-v15.md).
- Mesa com Grid 3D/2D, mapas, tokens, terrenos, iniciativa, turnos, aprovação de ações, dano/cura e dados: [controles do Grid](docs/vtt.md).
- Mural, cartões, apresentação de locais/NPCs e publicação para jogadores: [guia da Mesa](docs/mesa-mural-e-cenario-v14.md).
- Elementos, variantes, cores e pincéis de cenário: [guia de cenário](docs/vtt-variantes-cores-e-pinceis-v13.md).
- Novas regras, resultados de PV por nível, estilos, construções e peças para interiores: [guia da atualização 019](docs/regras-e-cenarios-v19.md).

As automações não cobrem todas as exceções do D&D. Acertos, salvaguardas, concentração, cobertura e efeitos condicionais continuam sujeitos à conferência do mestre. A visão individual opcional considera iluminação, escuridão, névoa e os bloqueios de visão dos objetos. As fichas preservam escolhas e ajustes próprios da mesa. Chat, marketplace, IA e modelagem livre não fazem parte desta versão.

## O que manter no repositório

Mantenha `src/`, `public/`, `supabase/`, os arquivos de configuração, `package.json` e **`package-lock.json`**. Testes, scripts e guias são úteis à manutenção e estão preservados. Os testes SQL usam PostgreSQL local via PGlite; geradores leem os arquivos `.sql` diretamente, sem duplicar o histórico em JSON.

Não envie `node_modules/`, `.next/`, `.env.local`, `.vercel/`, `supabase/.temp/`, logs, relatórios de testes, caches ou ZIPs. `.gitignore` cobre esses arquivos. `.vercelignore` exclui os arquivos de manutenção da preparação do build na Vercel, inclusive nos deploys pelo Git. Suas regras de pastas começam com `/` para limitar a exclusão à raiz: `/supabase/` exclui os SQLs do build e preserva `src/lib/supabase/`. Os SQLs, testes e guias continuam no repositório.

As capturas do Playwright ficam em `test-results/`. O script de importação de magias pode gerar um relatório em `docs/`; esse resultado não precisa ser versionado. Dependências, builds e relatórios são recriados pelos comandos do projeto.

## Validar alterações

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

Para os fluxos gerais de navegador, inicie o site com as variáveis Supabase vazias e a demonstração habilitada, e então:

```bash
npx playwright install chromium
npm run test:e2e
```

`E2E_BASE_URL` permite apontar os testes para outra porta local. A suíte da Mesa inicia sua própria aplicação e uma API local isolada:

```bash
npm run test:vtt
```

Os testes de criação, multiclasse, magias e itens usam o mesmo simulador local e têm seu próprio comando:

```bash
npm run test:integration
```

A oficina de itens tem testes próprios de criação, publicação, entrega, permissões e uso de funções no combate:

```bash
npm run test:items
```

Os fluxos de baús, chaves, portas e iluminação têm uma suíte própria:

```bash
npm run test:scenery
```

Moedas, recompensas combinadas, reposição, coleta de recursos, pistas e mecanismos vinculados têm testes específicos:

```bash
npm run test:rewards
```

O painel compacto tem testes próprios de navegação, rascunhos, cancelamento de pincéis, comandos, permissões e layout no celular:

```bash
npm run test:master-panel
```

O teste de desempenho usa 360 elementos, simula atraso de rede e verifica a resposta visual, a ausência de recarregamentos extras e a recuperação de uma falha:

```bash
npm run test:performance
```

Os testes locais não acessam nem alteram seu Supabase. Testes do ambiente real dependem das suas contas e da publicação. Os geradores em `scripts/` são ferramentas de manutenção e não devem ser executados como etapa de atualização desta limpeza.

## Créditos e fontes

Identidade Crônica e arte da fortaleza criadas para este projeto. Arte original gerada com ImageGen. Fontes Cinzel e Inter distribuídas pelo Fontsource, ícones Lucide, componentes Radix UI e renderização Three.js.

As regras usam D&D 5e de **2014 / SRD 5.1**. A atribuição e o alcance das referências estão em [fontes e atribuição](docs/fontes-dnd-v16.md), incluindo a licença [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). As regras de 2024 não foram combinadas com esta base.

As magias foram extraídas de `dd-5e-lista-de-magias-biblioteca-elfica.pdf`, Lista de Magias D&D 5 v1.4, com diagramação BigGod e tradução Apollo C., fornecido pelo usuário. O catálogo conserva as páginas e fontes; referências adicionais não estão todas abrangidas pelo SRD. A aplicação é independente e não é afiliada à Wizards of the Coast.
