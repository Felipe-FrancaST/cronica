# Assinaturas Mercado Pago e administração — instalação inicial 029

A atualização **032** permite pagar por **Pix**, com QR Code e copia e cola na própria página e renovação manual pelo período do plano. Se já instalou a **031**, execute somente a **032** e faça novo deploy conforme [o guia do Pix](LEIA-ME-PIX.md). A opção recorrente continua disponível.

Para a revisão anterior do erro **`provider_400` após o pagamento**, atualize o código e faça um novo deploy conforme [o guia de confirmação de pagamentos](LEIA-ME-CONFIRMACAO-PAGAMENTO.md). Essa revisão anterior da conferência não acrescentava SQL; para o Pix, aplique a **032**.

O código está preparado para cobrar **R$ 20,00 por mês do mestre**, com **jogadores gratuitos** como padrão. O pagamento recorrente usa o checkout de assinaturas do Mercado Pago; o Pix permite um pagamento único por período. Você precisa configurar a sua conta recebedora e o servidor para ativar cobranças reais; o pacote não contém credenciais e não fez cobranças.

O pacote inclui as **030, 031 e 032**. Se a **030 já está instalada**, aplique somente a **031**; se está na **029**, aplique **030 e 031** e siga [o guia de conta e pagamentos](LEIA-ME-CONTA-E-PAGAMENTOS.md). Ao final, aplique também a **032** para o Pix. As instruções abaixo descrevem a configuração inicial.

## Instalar no seu projeto

1. Preserve o `.env.local` e as configurações do seu projeto. Atualize os arquivos desta pasta.
2. Se seu banco já está na 028, execute `supabase/migrations/202610180029_subscriptions_and_site_admin.sql` e depois `supabase/migrations/202610180030_account_deletion_and_billing_reliability.sql` e `supabase/migrations/202610180031_account_deletion_legacy_attribution.sql` no SQL Editor do Supabase. Se estiver antes, aplique primeiro as migrações ausentes, em ordem. Não execute `schema.sql` sobre um banco existente.
3. Configure as variáveis abaixo na hospedagem e em seu `.env.local` para testes. Reinicie o servidor após alterar variáveis.
4. Cadastre uma conta dedicada à administração e confirme o e-mail. Edite `supabase/setup-site-admin.sql`, substitua `SUBSTITUA_PELO_SEU_EMAIL` e execute esse arquivo no SQL Editor. A conta passa a abrir **Administração**, sem acesso às aventuras. Não há login ou senha padrão. A administração não vem de metadados de cadastro nem de uma escolha no navegador.
5. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Publique o código e recarregue as abas dos participantes.

A migração ativa a exigência para todos os mestres, inclusive contas antigas. Para oferecer uma transição gratuita, antes de divulgar a atualização entre como administrador, desative a exigência de assinatura ou conceda cortesias às contas escolhidas. As campanhas são preservadas quando o acesso expira.

## Variáveis do servidor

| Variável                        | Conteúdo                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do seu projeto Supabase.                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon/publishable usada pelo login.                                                                             |
| `NEXT_PUBLIC_SITE_URL`          | URL canônica do site, com **HTTPS em produção**, sem caminho. É usada para retorno do checkout e validação de origem.        |
| `SUPABASE_SERVICE_ROLE_KEY`     | Chave privada service role do mesmo Supabase. Exclusiva do servidor.                                                         |
| `MERCADO_PAGO_ACCESS_TOKEN`     | Access Token da conta/aplicação que receberá as assinaturas.                                                                 |
| `MERCADO_PAGO_COLLECTOR_ID`     | **User ID numérico do vendedor** correspondente ao token; não é o Client ID.                                                 |
| `MERCADO_PAGO_APPLICATION_ID`   | Opcional: ID da aplicação, para validação adicional dos contratos.                                                           |
| `MERCADO_PAGO_WEBHOOK_SECRET`   | Assinatura secreta das notificações autenticadas.                                                                            |
| `MERCADO_PAGO_ENVIRONMENT`      | `test` para testes, `production` para pagamentos reais. O pagamento precisa pertencer ao ambiente escolhido.                 |
| `CRON_SECRET`                   | Segredo aleatório de **pelo menos 32 caracteres**, usado pelo agendamento. Exemplo de geração local: `openssl rand -hex 32`. |

Nunca prefixe chaves privadas com `NEXT_PUBLIC_`, não coloque credenciais no código e não envie `.env.local` ao repositório. O painel informa quais variáveis estão faltando e nunca mostra os valores. Contas reais não recebem acesso gratuito por falha de configuração.

## Configurar o Mercado Pago

O fluxo cria `POST /preapproval` com `status: pending`, `external_reference` exclusivo, valor e intervalo salvos no servidor e uma URL de retorno fixa. O cartão e os meios disponíveis são escolhidos **no Mercado Pago**; o site não recebe dados de cartão. Os planos do catálogo são locais: cada contratação gera uma assinatura individual sem plano remoto associado.

Na integração da sua conta, configure o destino de notificações como:

```text
https://SEU_SITE/api/billing/webhook
```

Os eventos tratados são `subscription_preapproval`, `subscription_authorized_payment` e `payment`. O endpoint exige `x-signature`, `x-request-id` e `data.id` na URL, confere HMAC e consulta o recurso original no Mercado Pago. O status enviado no corpo, o retorno do navegador e o parâmetro `retorno=1` nunca liberam acesso por conta própria. Notificações válidas entram numa fila persistente antes da confirmação HTTP e têm novas tentativas em caso de falha.

**Disponibilidade das notificações:** a configuração de eventos de assinatura depende da modalidade disponibilizada pelo Mercado Pago para a conta/aplicação. A documentação de assinaturas registra limitações na configuração pelo painel. Não foi acrescentado um campo `notification_url` sem suporte documentado ao corpo de criação. Se sua modalidade não entregar notificações com assinatura verificável, mantenha a conciliação agendada e o botão **Conferir pagamento**; o servidor não aceita IPN sem autenticação como confirmação. Valide os eventos efetivamente recebidos em homologação.

O `vercel.json` inclui uma conciliação diária às **06:00 UTC**, em `/api/billing/cron`. A Vercel usa `Authorization: Bearer CRON_SECRET`. Para operação com mais assinantes ou atualização mais frequente, configure um agendador que chame essa rota a cada 5–15 minutos com o mesmo cabeçalho, conforme os limites da sua hospedagem. A rota processa um lote por chamada e prioriza contas há mais tempo sem conferência. A administração permite conciliar mais lotes e conferir uma conta individualmente. Não exponha esse segredo em JavaScript do navegador.

Na Vercel, o agendamento é criado no deploy de produção e não roda automaticamente em previews. Consulte [a configuração oficial de cron](https://vercel.com/docs/cron-jobs/quickstart) e [a autenticação do agendamento](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Para homologação, use a URL e as variáveis do ambiente correspondente.

No retorno do checkout há uma conferência automática; o usuário pode atualizar novamente pelo botão. A aprovação inicial do provedor pode não ser imediata. Contrato **autorizado** significa renovação permitida; o acesso exige uma cobrança **aprovada**, do valor, moeda, conta recebedora e ambiente esperados.

Documentação oficial usada na integração:

- [Assinatura sem plano associado, com pagamento pendente](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments)
- [Criar assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post)
- [Buscar assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/search-preapproval/get)
- [Faturas da assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get)
- [Notificações e autenticação](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)

## O que o administrador controla

- **Visão geral:** contas, assinantes com período pago, contratações pendentes, total agregado de campanhas, receita mensal estimada e saúde das notificações.
- **Planos:** nomes, descrição, valores a partir de R$ 1,00, renovação mensal/trimestral/semestral/anual, acesso de mestre/jogador, limite de campanhas ativas e jogadores por campanha. Arquive um plano para impedir novas contratações.
- **Assinantes e contas:** busca por nome, e-mail ou ID; situação dos dois acessos; contratos e pagamentos; cancelamento de renovação; bloqueio; cortesias com prazo; concessão e remoção de administração a contas existentes. Não é possível bloquear um administrador nem remover seu próprio acesso.
- **Financeiro:** pagamentos efetivamente consultados no provedor, bruto, reembolsos/contestações, taxas e líquido informado, com datas de aprovação no fuso de São Paulo, paginação e CSV. O líquido informado **não é saldo disponível para saque**. Dados indisponíveis aparecem como desconhecidos. Exportações são limitadas a 10.000 registros por período; reduza o intervalo se necessário.
- **Configurações:** quem precisa pagar, gratuidade temporária, tolerância de renovação de 0–14 dias, manutenção, nome do site, e-mail de suporte e links de termos/privacidade.
- **Histórico:** responsável, data, alvo e motivo das alterações. Solicitações de conciliação e cancelamento também são registradas; confira o estado do contrato para ver a confirmação do provedor.

O administrador não ganha acesso ao conteúdo das campanhas. Para jogar ou mestrar, use outra conta. Publicar planos e alterar configurações exige um motivo para o histórico.

## Regras das assinaturas

- Mudanças de preço, intervalo ou limites valem **para novas contratações**. O contrato guarda as condições aceitas e a versão do plano. Não há reajuste silencioso em assinaturas em andamento.
- Existe no máximo uma contratação aberta por conta para evitar cobranças duplicadas. Um plano pode cobrir os dois acessos. Não há troca de plano com rateio: cancele a renovação e contrate o novo plano após o período pago.
- Cada pagamento aprovado dá um intervalo de calendário a partir da sua aprovação, em UTC, com ajuste para o último dia do mês. Notificações repetidas não acumulam meses. O período é calculado no banco.
- Cancelar interrompe as próximas renovações e mantém o período pago; não solicita reembolso. Reembolsos e disputas são operados na sua conta Mercado Pago e conferidos pelo sistema. Reembolso integral ou contestação revoga o período daquele pagamento; reembolso parcial conserva o período e atualiza o financeiro.
- A tolerância só se aplica depois de um período pago, enquanto a renovação permanece autorizada. Ela não libera a primeira contratação sem pagamento nem prolonga contratos cancelados.
- Bloquear a conta, ativar manutenção ou desativar a exigência de pagamento **não cancela cobranças no Mercado Pago**. Gerencie as renovações individualmente.
- Se uma criação de checkout sofrer interrupção, o pedido fica em conferência. Repetir a solicitação não cria outra cobrança. A busca pelo e-mail do pagador confere a referência original; não se repete automaticamente um POST de resultado incerto. Caso continue sem confirmação, consulte o suporte/conta Mercado Pago antes de qualquer correção manual.
- Os limites de campanhas e jogadores são conferidos também no banco. Planos arquivados continuam válidos para quem já contratou. Contas com assinatura expirada conservam acesso à própria conta, ao histórico e ao cancelamento da renovação.

## Validação local

`npm test` inclui testes PostgreSQL para cobrança padrão, permissões, pagamentos, reembolso, cancelamento, cortesias, manutenção, fila e isolamento da administração. Os testes antigos de RPG declaram explicitamente cobrança desativada na sua própria fixture.

```bash
npm run test:billing
```

O teste de navegador usa um Supabase simulado com PostgreSQL local e um provedor Mercado Pago simulado. Não usa suas credenciais nem realiza cobranças. Confira também `npm run test:scenery`, `npm run test:rewards`, `npm run test:master-panel` e `npm run test:performance` para as funcionalidades anteriores do Grid.

Antes de ativar produção, faça uma contratação no ambiente de testes da sua aplicação Mercado Pago, confirme o pagamento, o acesso, a renovação e o cancelamento. Depois configure token/recebedor de produção, `MERCADO_PAGO_ENVIRONMENT=production`, URL HTTPS, notificações e agendamento. Isso depende da sua conta real e não foi executado neste pacote.
