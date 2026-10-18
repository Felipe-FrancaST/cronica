# Exclusão de conta e revisão dos pagamentos — atualização 030

## Atualizar seu site

1. Preserve seu `.env.local` e as variáveis já configuradas na hospedagem.
2. Se você já executou a **029**, execute somente `supabase/migrations/202610180030_account_deletion_and_billing_reliability.sql` no SQL Editor do Supabase. Não execute novamente a instalação completa nem `schema.sql` em seu banco existente.
3. Atualize o código e faça um novo deploy. As migrações 001–029 continuam intactas; o preço dos planos e suas configurações são preservados.
4. Teste com contas e credenciais de teste antes de usar pagamentos reais. Este pacote não efetuou cobranças reais nem excluiu contas do seu projeto.

Para uma instalação nova, aplique as migrações 001–030 em ordem e siga também [a configuração inicial de assinaturas](LEIA-ME-ASSINATURAS.md). O cadastro inicial do administrador só precisa ser feito se ele ainda não existir.

## Como o usuário exclui a conta

Em **Configurações → Excluir minha conta**, o usuário vê a quantidade de campanhas, personagens e participações que serão afetados. Precisa informar a senha atual, digitar **EXCLUIR MINHA CONTA** e confirmar que entende a exclusão permanente. A administração tem o atalho **Minha conta** para a mesma página.

- As campanhas criadas pelo usuário são excluídas por completo, incluindo fichas de participantes, mapas, itens, sessões e arquivos associados.
- As campanhas de outros mestres são preservadas. São removidos os personagens do usuário, participações, ações e registros vinculados a ele, inclusive em sessões arquivadas.
- Perfil, uploads antigos e atuais, dados locais da conta, histórico financeiro local, referências de auditoria e a identidade de autenticação são removidos. O acesso da sessão é encerrado.
- Antes de apagar os dados, o servidor confirma o cancelamento das renovações ativas no Mercado Pago. Se não conseguir confirmar, mantém os dados da conta para uma nova tentativa.
- Arquivos são removidos pela API do Storage, antes da exclusão da identidade. Uma falha pode ser retomada por **Continuar exclusão**, sem repetir o cancelamento já confirmado. Enquanto houver remoção pendente, novas alterações nos dados envolvidos ficam bloqueadas.
- O último administrador ativo precisa cadastrar outro administrador antes de excluir a própria conta.

A exclusão não pede reembolso e não exclui a conta ou os registros mantidos pelo próprio Mercado Pago. Como o histórico financeiro do usuário é apagado do banco do site, os totais locais da administração podem mudar.

## O que mudou nos pagamentos

- O checkout consulta novamente a assinatura no Mercado Pago antes de apresentar o endereço ao usuário. Somente a resposta canônica validada pode liberar esse endereço.
- Uma conexão interrompida não dispara outra contratação automaticamente. O pedido continua em conferência, preservando sua referência para recuperar a assinatura original.
- Tentativas definitivamente recusadas podem ser refeitas; falhas de resposta mantêm a referência original para evitar pedidos duplicados.
- O cancelamento verifica o estado atual no provedor. Se o cancelamento anterior tiver sido concluído e sua resposta se perder, a próxima tentativa recupera a confirmação sem outro pedido de cancelamento.
- Uma divergência comercial de preço não impede o cancelamento de uma assinatura cuja titularidade foi validada. As validações de conta recebedora, aplicação, referência e vínculo permanecem obrigatórias.
- Uma assinatura antiga com erro não interrompe a conferência da assinatura atual. O erro fica registrado para revisão.
- Reembolsos de pagamentos já verificados continuam podendo revogar o acesso mesmo se a recorrência remota tiver divergido do plano. Essa situação não autoriza novos períodos de acesso.
- Uma mudança de versão do plano exige uma nova confirmação da cobrança recorrente. Ações repetidas durante uma operação ficam bloqueadas.
- As respostas distinguem divergência de conta recebedora, aplicação, moeda, valor e intervalo, sem mostrar tokens ou chaves privadas.

## Conferir a configuração

| Variável                      | Valor esperado                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`        | Endereço do site, HTTPS em produção, sem caminho, parâmetros ou fragmento.             |
| `SUPABASE_SERVICE_ROLE_KEY`   | Chave privada do servidor, também usada para remover arquivos e a identidade da conta. |
| `MERCADO_PAGO_ACCESS_TOKEN`   | Access Token da conta/aplicação recebedora, no ambiente escolhido.                     |
| `MERCADO_PAGO_COLLECTOR_ID`   | **User ID numérico do vendedor**, correspondente ao token. Não use o Client ID.        |
| `MERCADO_PAGO_APPLICATION_ID` | Opcional: ID numérico da aplicação para validação adicional. Pode ficar vazio.         |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura secreta das notificações configuradas para a integração.                    |
| `MERCADO_PAGO_ENVIRONMENT`    | `test` ou `production`, como variável do servidor.                                     |
| `CRON_SECRET`                 | Segredo aleatório com pelo menos 32 caracteres.                                        |

Espaços acidentais no início ou fim das variáveis são desconsiderados. Identificadores inválidos e ambiente ausente são detectados antes de iniciar uma cobrança. Continue mantendo os segredos sem o prefixo `NEXT_PUBLIC_`.

Se aparecer uma mensagem sobre a **conta recebedora**, confira primeiro `MERCADO_PAGO_COLLECTOR_ID` e o Access Token. Se a mensagem mencionar a **aplicação**, confira o ID opcional. A revisão não altera automaticamente essas credenciais na hospedagem.

## Validação local

```bash
npm ci
npm run typecheck
npm test
npm run test:billing
npm run test:account
npm run build
```

Os testes de pagamento e exclusão usam PostgreSQL local e um provedor simulado. Validam senha incorreta, confirmação, proteção de origem, isolamento de contas, falhas de cancelamento/Storage/identidade, retomada, arquivos antigos, sessões arquivadas, duplicidade de pedido, reembolsos, consentimento e telas estreitas. Os testes de navegador exigem Chromium instalado pelo Playwright ou `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Referências oficiais: [exclusão de usuários no Supabase](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users), [remoção de objetos do Storage](https://supabase.com/docs/guides/storage/management/delete-objects), [consulta de assinatura no Mercado Pago](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get) e [atualização de assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put).
