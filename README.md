# Crônica — atualização 053 · Arkanis

Plataforma de RPG com campanhas, personagens, NPCs, construção de mundo, sessões, mural e mesa tática 2D/3D. Agora também inclui Arkanis, com ficha própria e biblioteca de ingredientes para alquimia. A base usa Next.js, React, TypeScript e Supabase, com suporte a D&D 5e de 2014 e assinaturas Mercado Pago.

## Instalação e atualização

Use **[LEIA-ME-ATUALIZACAO.md](LEIA-ME-ATUALIZACAO.md)** como roteiro atual. **Aplique a migração 053** no banco já atualizado até a 050 e publique o código. Ela corrige o uso indevido de SQLSTATE 40001 que provoca repetição de transações no PostgREST 14. O export completo `schema.sql` é exclusivo para banco novo.

Requisitos: Node.js 22 ou superior e npm. Na pasta que contém `package.json`:

```bash
npm ci
npm run dev
```

Preencha a configuração local a partir de `.env.example`, preservando as credenciais e os endereços do seu projeto existente. Com Supabase configurado, o site usa a autenticação e o banco reais. Para uma demonstração local, deixe as variáveis Supabase vazias e ative `NEXT_PUBLIC_ENABLE_DEMO=true`; os exemplos são gravados no navegador. Em produção, mantenha a demonstração desativada.

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

O workflow de validação executa instalação, tipos, testes e build. Testes locais de banco usam PostgreSQL via PGlite, sem acessar sua base real.

## Atualização 053

Veja [ALTERACOES-053.md](ALTERACOES-053.md) para a relação das correções e da validação. O pacote contém os arquivos necessários à instalação, sem dependências pré-instaladas nem builds gerados. Configure a manutenção frequente conforme o guia; ativar o workflow ou mudar o agendamento da hospedagem depende da sua configuração.

## Testes de navegador

```bash
npx playwright install chromium
npm run test:campaigns
npm run test:arkanis
npm run test:canvas-switch
npm run test:mural-maps
npm run test:guided-combat
```

Os arquivos Playwright iniciam servidores de teste próprios nos comandos específicos. A suíte geral `npm run test:e2e` exige o site de demonstração já iniciado. Os guias incluídos descrevem as demais suítes de mapas, fichas, pagamentos, visibilidade e cenário. Capturas e relatórios de teste não fazem parte do pacote de distribuição.

## Guias de funcionalidades

- [Mesa, sessões e mural](docs/mesa-mural-e-cenario-v14.md).
- [Oficina de mapas](LEIA-ME-OFICINA-DE-MAPAS.md), [bibliotecas de imagens](LEIA-ME-BIBLIOTECA-DE-MAPAS.md) e [marcações no mural](LEIA-ME-MAPAS-NO-MURAL.md).
- [Fichas, criação e imagens](LEIA-ME-CRIACAO-E-IMAGENS.md), [exportação PDF](LEIA-ME-FICHA-PDF.md) e [ações de personagens](LEIA-ME-FICHAS-E-ACOES.md).
- [Itens da campanha](LEIA-ME-ITENS-DA-CAMPANHA.md), [combate guiado](LEIA-ME-FICHAS-E-COMBATE.md) e [NPCs, condições e visão](LEIA-ME-NPCS-CONDICOES-E-VISAO.md).
- [Assinaturas e administração](LEIA-ME-ASSINATURAS.md), [Pix](LEIA-ME-PIX.md) e [conta e pagamentos](LEIA-ME-CONTA-E-PAGAMENTOS.md).

Os documentos numerados descrevem suas respectivas versões; o roteiro de atualização da raiz informa a sequência atual. As regras automatizadas continuam sujeitas à conferência do mestre para as exceções do sistema.

## Créditos e fontes

Identidade Crônica e arte da fortaleza criadas para este projeto. Arte original gerada com ImageGen. Fontes Cinzel e Inter distribuídas pelo Fontsource, ícones Lucide, componentes Radix UI e renderização Three.js.

As regras usam D&D 5e de **2014 / SRD 5.1**. A atribuição e o alcance das referências estão em [fontes e atribuição](docs/fontes-dnd-v16.md), incluindo a licença [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). As regras de 2024 não foram combinadas com esta base.

As magias foram extraídas de `dd-5e-lista-de-magias-biblioteca-elfica.pdf`, Lista de Magias D&D 5 v1.4, com diagramação BigGod e tradução Apollo C., fornecido pelo usuário. O catálogo conserva as páginas e fontes; referências adicionais não estão todas abrangidas pelo SRD. A aplicação é independente e não é afiliada à Wizards of the Coast.
