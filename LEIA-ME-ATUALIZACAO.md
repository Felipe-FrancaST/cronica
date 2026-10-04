# Projeto atualizado — classes, raças, magias e conjuração

Este é o projeto completo atualizado, em uma pasta nova chamada `cronicarpg-atualizado`.

## Abrir esta versão

1. Pare o servidor da versão anterior (Ctrl+C no terminal onde ele está rodando).
2. Extraia este ZIP em uma pasta nova e entre em `cronicarpg-atualizado`.
3. Abra o terminal nessa pasta, onde está o `package.json`.
4. Execute `npm ci` e depois `npm run dev`.
5. Abra `http://localhost:3000`. Na aplicação, entre em **Compêndio D&D**.

O ZIP inclui somente o projeto e seus arquivos necessários; as dependências são instaladas com `npm ci`.
Se usar Vercel, atualize os arquivos do repositório e faça um novo deploy. O download do ZIP não atualiza o site publicado automaticamente.

## Onde aparecem as mudanças

- Menu **Compêndio D&D**: catálogo com filtros de classe, círculo, escola, nome português/inglês, ritual e concentração.
- Ficha → **Identidade**: 13 classes e 112 opções de raça, linhagem e variante, com fontes.
- Ficha → **Magias**: catálogo, 361 magias do PDF (27 truques), preparação, espaços por classe/nível, conjuração e descansos.
- Bruxo: espaços de pacto e Arcanos Místicos com contadores separados.
- NPC → **Ataques e magias**: botão **Catálogo de magias**.
- A mesa 3D continua incluída e foi validada na mesma entrega.

Os catálogos estão em `src/systems/dnd5e/data/classes.json`, `races.json` e `spells.json`.
As regras de espaços e descansos estão em `src/systems/dnd5e/spellcasting.ts`.
A lista dos arquivos novos e alterados está em `docs/arquivos-alterados.json`.

## Supabase

- Banco com as migrações 001–007: execute somente `supabase/migrations/202610040008_dnd_catalog.sql`, uma vez, ou aplique as migrações pendentes com a CLI.
- Banco novo: execute `supabase/schema.sql`, uma vez, ou instale todas as migrações com a CLI.
- O guia detalhado está em `docs/dnd-catalogo-e-migracao.md`.

A migração remota ainda deve ser aplicada ao seu projeto Supabase. Configuração de autenticação, variáveis e deploy estão no `README.md`.
