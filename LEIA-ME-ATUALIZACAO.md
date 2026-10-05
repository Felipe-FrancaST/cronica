# Projeto atualizado — VTT v10, mesa e dados

Extraia este ZIP em uma pasta nova: `cronicarpg-vtt-v10`. Esta entrega contém o código atualizado, a migração 010 e os testes das novas funções.

1. Pare o servidor antigo e abra no terminal a pasta nova que contém `package.json`.
2. Mantenha seu `.env.local` e suas variáveis de hospedagem.
3. No Supabase que já recebeu as migrações 001–009, execute **somente** `supabase/migrations/202610050010_battle_dice.sql`, uma vez. Não reexecute `schema.sql` nem migrações anteriores. Para banco novo, use o esquema completo.
4. Execute `npm ci`, `npm run build` e `npm run dev` para testar, ou publique pelos seus procedimentos atuais.
5. Atualize a página do mestre e dos jogadores. Abra **Campanha → Mesa tática**.

O passo a passo e os controles estão em `docs/vtt-desempenho-dados-e-migracao.md`. O manifesto `docs/arquivos-alterados-vtt-v10.json` compara esta entrega à v9.

As mudanças aparecem na organização da mesa, em **selecionar NPC → Editar ficha do NPC**, na aba **Dados** e nos botões **Rolar dano / Rolar cura** antes de aprovar. Os sete tipos de dado têm animação, histórico e modificadores. A aprovação usa exatamente o resultado já registrado.

O download não atualiza automaticamente o site publicado nem executa a migração no seu Supabase.
