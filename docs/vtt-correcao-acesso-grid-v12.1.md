# VTT v12.1 — acesso à edição e configuração do mapa

A v12 verificava se qualquer sessão da campanha estava ativa para bloquear o cenário. O indicador de combate e o botão de encerrar, porém, consideravam apenas a sessão do mapa aberto. Um combate em outro mapa ou uma sessão antiga sem mapa podia, portanto, deixar **Editar grid** bloqueado enquanto a mesa mostrava **Preparação**. **Configurar mapa** também dependia de habilitar a edição antes de abrir.

A v12.1 alinha a interface e o banco com a sessão do mapa aberto. Nos estados **Preparação** e **Encerrado**, o mestre pode clicar em **Editar grid** e abrir **Configurar mapa** diretamente. Ao iniciar um combate nessa mesa, a edição e a configuração abertas se fecham e os controles ficam bloqueados. Encerrar o combate libera os dois novamente. Trocar de mapa aplica a regra da sessão correspondente, inclusive no celular e depois de recarregar a página.

Mapas ligados por portal compartilham a sessão: durante o combate, todos eles continuam protegidos. Conectar um novo portal a um mapa com combate ativo é recusado pelo banco para preservar sua iniciativa e recursos. Combates independentes permanecem intactos; a correção não os encerra automaticamente.

## Atualizar

1. Extraia o pacote v12.1 em uma pasta nova e copie seu `.env.local` atual para ela.
2. Execute `npm ci` na pasta que contém `package.json`.
3. Se você já aplicou a 012 da entrega anterior, execute **somente** `supabase/migrations/202610060013_scope_grid_editing.sql` no SQL Editor do seu projeto Supabase. Se ainda está na 011, aplique a 012 e depois a 013. Use o histórico da CLI se esse já é seu fluxo de migração.
4. Execute `npm run build` e atualize sua instalação com o projeto corrigido. Para conferir localmente, use `npm run dev`.
5. Recarregue a página, abra **Mesa tática** e selecione o mapa desejado. **Configurar mapa** fica disponível diretamente. Para os objetos e terrenos, abra **Cenário → Editar grid**.

As migrações 001–012 não foram modificadas. A 013 substitui somente duas funções privadas de validação; não apaga ou recria seus dados. A correção precisa do código novo e da migração: atualizar apenas um dos dois deixa a interface e o banco com regras diferentes.

## Conferência incluída

Os testes cobrem mapas em preparação e encerrados com outras sessões ativas, sessões sem mapa, edição e configuração no computador e celular, troca de mapas, recarregamento, encerramento e reinício de combate, bloqueio em mapas ligados e tentativa de conectar um portal a uma sessão ativa. O relatório desta entrega está em `docs/verificacao-vtt-v12.1.json`; a comparação com o ZIP v12 está em `docs/arquivos-alterados-vtt-v12.1.json`.
