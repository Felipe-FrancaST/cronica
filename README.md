# Crônica RPG

Plataforma de campanhas de RPG em português, com Next.js, React, TypeScript, Tailwind CSS, Three.js e Supabase. Preparada para a Vercel.

Esta revisão une visualmente estradas, água, gelo, lava e pisos, elimina sobreposições que causavam cintilação e adiciona iluminação de **dia/noite por mapa**, com luz local dos elementos. O mestre também pode excluir capítulos do histórico de sessões, com confirmação. O catálogo mantém somente o obelisco no lugar da estátua. As melhorias anteriores, a cidade medieval e os SQLs existentes estão preservados. **Se a migração 020 já foi aplicada, execute somente a 021.** Consulte [as instruções de atualização](LEIA-ME-ATUALIZACAO.md) e [o guia de superfícies, iluminação e exclusão](docs/iluminacao-e-sessoes-v21.md).

## Executar localmente

Use Node.js 22 ou superior. Abra a pasta `cronicarpg`, onde está o `package.json`:

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
2. No SQL Editor do seu Supabase, execute `supabase/migrations/202610070021_grid_lighting_and_session_deletion.sql` se sua instalação já recebeu as migrações até a 020. Caso esteja numa versão anterior, aplique as migrações que faltam, em ordem.
3. Execute `npm ci` e `npm run build`.
4. Envie o código pelo processo que já utiliza. Mantenha o projeto Vercel, as variáveis e as URLs autorizadas no Supabase.
5. Recarregue as abas do mestre e dos jogadores.

**No banco que já funciona, execute apenas a nova migração 021 se já está na 020; não execute novamente `schema.sql` nem os SQLs antigos.** As 21 migrações e os modelos SQL continuam versionados para manutenção e testes. A aplicação não executa SQLs automaticamente. Para uma instalação totalmente nova, use as migrações em ordem; `supabase/schema.sql` preserva a referência da instalação anterior.

Na Vercel, a pasta raiz continua sendo a que contém `package.json`: instalação `npm ci`, build `npm run build`, framework Next.js. As configurações existentes de Auth, Storage, Realtime e hospedagem continuam válidas.

## Funcionalidades e guias

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

As automações não cobrem todas as exceções do D&D. Acertos, salvaguardas, concentração, cobertura e efeitos condicionais continuam sujeitos à conferência do mestre. As fichas preservam escolhas e ajustes próprios da mesa. Chat, pagamentos, marketplace, IA, linha de visão automática e modelagem livre não fazem parte desta versão.

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

Os testes locais não acessam nem alteram seu Supabase. Testes do ambiente real dependem das suas contas e da publicação. Os geradores em `scripts/` são ferramentas de manutenção e não devem ser executados como etapa de atualização desta limpeza.

## Créditos e fontes

Identidade Crônica e arte da fortaleza criadas para este projeto. Arte original gerada com ImageGen. Fontes Cinzel e Inter distribuídas pelo Fontsource, ícones Lucide, componentes Radix UI e renderização Three.js.

As regras usam D&D 5e de **2014 / SRD 5.1**. A atribuição e o alcance das referências estão em [fontes e atribuição](docs/fontes-dnd-v16.md), incluindo a licença [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). As regras de 2024 não foram combinadas com esta base.

As magias foram extraídas de `dd-5e-lista-de-magias-biblioteca-elfica.pdf`, Lista de Magias D&D 5 v1.4, com diagramação BigGod e tradução Apollo C., fornecido pelo usuário. O catálogo conserva as páginas e fontes; referências adicionais não estão todas abrangidas pelo SRD. A aplicação é independente e não é afiliada à Wizards of the Coast.
