# Alterações 051

- Removida a rolagem forçada para o topo ao navegar nas seções de Arkanis; foco preservado sem rolagem e navegação por teclado adicionada.
- Salvamento confirmado separado da espera pela recarga geral. A ficha confirmada é aplicada à lista antes da leitura de sincronização.
- Limite de espera e cancelamento para a requisição de salvar personagem, com preservação do controle de versão e mensagem quando a confirmação não chega.
- Limite HTTP no cliente Supabase e tratamento de demora no envio de retrato.
- Rascunhos com debounce real: a limpeza do efeito não grava mais a cada tecla. Persistência explícita antes de salvar Arkanis e ao ocultar/sair da página.
- Testes de requisição bloqueada, recarga bloqueada após gravação, versão confirmada, rascunho preservado e posição de rolagem.
- Nenhuma alteração de schema ou migração nova. Banco permanece na 050.
