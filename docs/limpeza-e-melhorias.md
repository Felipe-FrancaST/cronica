# Revisão de limpeza e melhorias

Revisão de 7 de outubro de 2026, feita sobre o `cronicarpg.zip` fornecido.

## Resultado da análise

O projeto já possui uma separação útil entre interface, regras de RPG, repositórios e SQLs. Todas as dependências diretas têm uso, e os arquivos de `src/` fazem parte do grafo de rotas/importações. O maior excesso estava nos builds, caches, evidências antigas e cópias repetidas dos SQLs.

O pacote original tinha 782 arquivos e 68,4 MB. A revisão mantém o código, os assets, os SQLs e as ferramentas de manutenção, com um ZIP de aproximadamente 1,5 MB. A pasta principal continua sendo `cronicarpg`.

## Limpeza aplicada

- Retirada de `.next/`, que reunia 498 arquivos de build/cache.
- Retirada de `.env.local`, `tsconfig.tsbuildinfo` e `supabase/.temp/` do pacote para envio. O `.env.local` atual deve continuar no seu computador.
- Remoção de screenshots, logs de build/typecheck/testes, manifestos de alterações e guias antigos de migração/validação já substituídos.
- Remoção de `supabase/development-sources.json`, que repetia cerca de 2 MB de SQLs já presentes nos arquivos. O único modelo exclusivo foi extraído para `supabase/templates/v17-combat.sql` com o mesmo conteúdo.
- Atualização de `.gitignore` para arquivos temporários do Supabase, logs, ZIPs, caches Python e o relatório gerado pela importação de magias.
- Inclusão de `.vercelignore` para uploads pela CLI, preservando os arquivos que participam do build.
- Capturas de navegador movidas para o diretório de resultados do Playwright, usando `testInfo.outputPath`.

Testes, geradores, lockfile, catálogos, fontes e guias de uso foram mantidos. Os SQLs históricos continuam úteis para reprodução dos testes e manutenção do banco; não são executados automaticamente pela aplicação.

## Melhorias no código

- As seis seções de campanha — personagens, mundo, NPCs, Mesa, sessões e regras — usam carregamento sob demanda com estado de carregamento.
- Capas secundárias e avatares usam carregamento adiado; as capas principais têm prioridade. Imagens que falham voltam a exibir o fallback.
- Imagens locais e dados da demonstração não criam mais timers de renovação. URLs privadas mantêm a renovação existente.
- Um componente de abas compartilhado oferece setas, Home/End, foco e associação com o painel. É usado no compêndio e nas fichas de personagem/NPC.
- A navegação possui o atalho “Ir para o conteúdo”. Descrições adicionais dos campos são preservadas junto às dicas.
- Imports sem uso foram removidos. `noUnusedLocals` e `noUnusedParameters` passam a impedir novos casos na verificação TypeScript.
- A suíte de criação/multiclasse ganhou `npm run test:integration`, que inicia seu próprio simulador. O fluxo geral foi atualizado para o modo manual de atributos e o inventário atual.
- README e instruções de atualização explicam o pacote atual e não pedem reaplicação de migrações.

## Preservação das integrações

Os 22 arquivos SQL que já existiam foram comparados byte a byte e permanecem iguais. Todas as 21 fontes SQL contidas no JSON antigo também foram conferidas: 20 já tinham cópias idênticas; a restante agora é o modelo `v17-combat.sql`.

Clientes Supabase, proxy, rotas de autenticação, serviços de acesso/Storage, repositórios das funcionalidades, `next.config.ts`, `vercel.json` e `package-lock.json` foram comparados com o original e permanecem iguais. A declaração de dependências e suas versões também foi mantida.

**Esta revisão não exige executar SQL no banco em uso.** Mantenha as variáveis e as configurações atuais do Supabase e da Vercel.

## Validação

| Verificação                                                           | Resultado            |
| --------------------------------------------------------------------- | -------------------- |
| TypeScript, incluindo prevenção de código sem uso                     | Aprovado             |
| Regras, PostgreSQL local/PGlite e autorização                         | 172 testes aprovados |
| Campanhas, fichas, catálogo, NPCs e navegação desktop/celular/teclado | 9 testes aprovados   |
| Criação, multiclasse, origens de magia e itens                        | 9 testes aprovados   |
| Mesa 3D/2D, combate, dados, cenários, névoa, portais e sessões        | 49 testes aprovados  |
| Build de produção a partir dos arquivos usados no deploy              | Aprovado             |
| Formatação                                                            | Aprovada             |

**Total: 239 testes aprovados** (172 de lógica/banco e 67 de navegador).

Os 67 fluxos de navegador foram conferidos em builds de produção; os testes de integração usam uma API local isolada. Foram utilizados pacotes locais com versões conferidas contra o lockfile. A instalação do zero por `npm ci` não foi validada neste ambiente por falta de cache completo para download offline. O código e as configurações de instalação continuam os mesmos.

A revisão não executou comandos no seu banco remoto nem publicou o site. A validação descrita é local; as integrações remotas foram preservadas por comparação dos arquivos.

## Usar o pacote

Extraia em uma pasta nova, copie seu `.env.local` atual e siga `LEIA-ME-ATUALIZACAO.md`. Se aplicar a revisão a um repositório existente, remova também os arquivos retirados listados acima: `.gitignore` não exclui arquivos que já estavam versionados. O pacote novo não contém esses resíduos.
