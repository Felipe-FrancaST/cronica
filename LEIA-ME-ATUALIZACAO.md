# Projeto atualizado — Sessões e Regras v15

Extraia este ZIP em uma pasta nova: `cronicarpg-vtt-v15`. Esta entrega contém o projeto completo, preserva os recursos da Mesa v14 e acrescenta sessões com arquivo de cenários e regras da campanha.

1. Pare o servidor antigo e abra no terminal a pasta nova que contém `package.json`.
2. Mantenha seu `.env.local` e as variáveis atuais de hospedagem.
3. Se o Supabase já recebeu as migrações 001–015, execute **somente** `supabase/migrations/202610060016_campaign_sessions_and_rules.sql`, uma vez, no SQL Editor. Se faltam migrações, aplique-as em ordem. Use `schema.sql` apenas num banco novo.
4. Execute `npm ci`, `npm run build` e `npm run dev`, ou publique pelo procedimento que já usa.
5. Entre em **Campanha → Sessões**. A Mesa existente fica preservada em uma sessão chamada **Mesa existente**. Renomeie-a se estiver em preparação e clique em **Iniciar sessão**.
6. Abra **Mesa → Grid / Mural** e escolha a sessão. Ao encerrar, o cenário e o histórico ficam salvos; as peças saem dos grids sem apagar as fichas.
7. Para subir todos os personagens de nível, entre em **Regras**, defina **Nível atual do grupo**, marque **Mestre controla o nível de todos** e salve.

O guia completo está em [docs/sessoes-e-regras-v15.md](docs/sessoes-e-regras-v15.md). O manifesto de alterações compara esta entrega ao ZIP v14.

O download não modifica sozinho o site publicado e não executa a migração no seu Supabase.
