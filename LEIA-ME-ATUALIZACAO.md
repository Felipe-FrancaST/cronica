# Projeto atualizado — Multiclasse e Criação v16

Extraia `cronicarpg-multiclasse-e-criacao-v16.zip` numa pasta nova e abra `cronicarpg-vtt-v16`, onde está o `package.json`. A entrega contém o projeto completo, mantendo Sessões, Regras, Grid, Mural e combate.

1. Pare o servidor antigo e abra no terminal a pasta nova que contém `package.json`.
2. Mantenha seu `.env.local` e as variáveis atuais de hospedagem.
3. Se o Supabase já recebeu as migrações 001–016, execute **somente** `supabase/migrations/202610060017_multiclass_and_character_builds.sql`, uma vez, no SQL Editor. Se faltam migrações, aplique-as em ordem. Use `schema.sql` apenas num banco novo.
4. Execute `npm ci`, `npm run build` e `npm run dev`, ou publique pelo procedimento que já usa.
5. Crie/abra uma ficha. Em **Criação assistida**, escolha atributos, perícias, antecedente e pacote de equipamento. Os benefícios do pacote são aplicados uma única vez.
6. Em **Classes e habilidades**, distribua níveis, selecione caminhos e escolhas, aplique melhorias de atributos e registre usos dos recursos. O total respeita o nível definido pelo mestre quando a campanha tem bloqueio ativo.
7. Em **Magias**, selecione a classe do grimório. A origem define atributo e aprendizado; espaços comuns e Pacto têm reservas próprias. Vida, Devoção e Terra oferecem suas magias concedidas.
8. No **Compêndio**, consulte **Habilidades e caminhos**, **Antecedentes** e **Criação e multiclasse**.

As fichas existentes continuam válidas. As migrações 001–016 não foram alteradas. A base é SRD 5.1 / 2014; habilidades de suplementos, incluindo as especialidades do Artífice, podem ser registradas manualmente.

Consulte [o guia completo](docs/multiclasse-e-criacao-v16.md), [fontes e escopo](docs/fontes-dnd-v16.md) e [validação](docs/validacao-v16.md). O manifesto `docs/arquivos-alterados-v16.json` compara esta entrega ao ZIP v15.

O download não modifica sozinho o site publicado e não executa a migração no seu Supabase.
