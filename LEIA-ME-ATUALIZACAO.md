# Projeto atualizado — VTT v9, ações e áreas de magia

Extraia este ZIP em uma pasta nova: `cronicarpg-vtt-v9`. Esta entrega contém alterações reais no código da mesa tática e a nova migração 009.

1. Pare o servidor antigo e abra no terminal a pasta nova que contém `package.json`.
2. Mantenha seu `.env.local` e suas variáveis de hospedagem.
3. No Supabase que já recebeu as migrações 001–008, execute **somente** `supabase/migrations/202610040009_battle_actions.sql`, uma vez. Não reexecute `schema.sql` nem a 008. Para banco novo, use o esquema completo.
4. Execute `npm ci`, `npm run build` e `npm run dev` para testar, ou publique pelos seus procedimentos atuais.
5. Atualize a página do mestre e dos jogadores. Abra **Campanha → Mesa tática**.

O passo a passo e os controles estão em `docs/vtt-acoes-e-migracao.md`. O manifesto `docs/arquivos-alterados-vtt-v9.json` compara esta entrega ao ZIP que você enviou.

As mudanças aparecem em **Configurar mapa** (imagem), abaixo do personagem do jogador (**Abrir ficha / Executar ações**), no grid (prévia de área e cores) e em **Ferramentas do mestre → Tentativas dos jogadores** (Sucesso / Falha).

O download não atualiza automaticamente o site publicado nem executa a migração no seu Supabase.
