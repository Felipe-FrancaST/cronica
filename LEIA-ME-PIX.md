# Pix — atualização 032

O usuário pode escolher **Pix** ou **Assinatura recorrente** na tela Minha assinatura. O Pix exibe QR Code e código copia e cola na própria página, com renovação manual ao final do período. A opção recorrente mantém o checkout do Mercado Pago e a renovação automática.

## Atualizar o site

1. Se seu banco já está na **031**, execute **somente** `supabase/migrations/202610190032_pix_payments.sql` no SQL Editor do Supabase. Em bancos anteriores, aplique primeiro as migrações ausentes, em ordem, até a 031, e depois a 032.
2. Atualize os arquivos do projeto com este pacote, preservando seu `.env.local` e as variáveis da Vercel.
3. Faça um **novo deploy na Vercel**. A migração deve estar aplicada antes de disponibilizar o novo código.
4. Confirme as configurações do Mercado Pago descritas abaixo. Abra Minha assinatura para ver a opção Pix nas contas que precisam contratar um período.

As migrações **001–031 foram preservadas**. A 032 mantém planos, preços, assinaturas e pagamentos existentes. `supabase/schema.sql` já inclui a 032, mas é exclusivo para uma instalação nova; não execute esse arquivo completo em seu banco existente.

## Mercado Pago

- A conta recebedora deve ter uma **chave Pix cadastrada no Mercado Pago**, conforme os requisitos do produto de pagamentos. A chave é administrada no Mercado Pago; não é necessário colocá-la no código ou em uma variável da Vercel.
- O fluxo usa as credenciais de servidor já configuradas: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_COLLECTOR_ID`, `MERCADO_PAGO_ENVIRONMENT` e `MERCADO_PAGO_WEBHOOK_SECRET`, além das configurações existentes de Supabase e URL HTTPS do site.
- Na aplicação do Mercado Pago, mantenha o webhook do site e habilite também os eventos de **Pagamentos** (`payment`). Preserve os eventos de assinaturas já utilizados.
- O endereço continua sendo `https://SEU_DOMINIO/api/billing/webhook`. O cadastro da aplicação e o segredo de assinatura devem corresponder às credenciais usadas no servidor. `NEXT_PUBLIC_SITE_URL` deve apontar para o domínio público correto.

Não foi acrescentada uma nova credencial obrigatória. Tokens e segredo do webhook continuam exclusivos do servidor.

## Como funciona para o usuário

1. Escolha o plano e selecione **Pix**.
2. Informe o e-mail e o CPF do pagador e confirme o pagamento único pelo valor e período apresentados.
3. Clique em **Gerar Pix** e pague usando o QR Code ou **Copiar código Pix**.
4. A página confere o pagamento enquanto está visível. O usuário também pode clicar em **Já paguei, conferir Pix** ou **Conferir pagamento**.
5. Após a confirmação do Mercado Pago, o acesso fica disponível pelo período do plano, contado da aprovação. Um plano mensal libera um mês de calendário; planos de 3, 6 ou 12 meses mantêm suas respectivas durações.

O código tem validade de 24 horas. Recarregar ou reabrir a página recupera o mesmo pedido. Se o código ainda estiver pendente, **Cancelar Pix** confirma seu encerramento no Mercado Pago antes de liberar outro pedido. Um código expirado é conferido e encerrado antes da criação de um novo.

O pagamento via Pix é **único por período**. Ao vencer o acesso, o usuário volta à tela de planos e escolhe como pagar o próximo período. Um novo período não pode ser comprado enquanto o período já pago estiver ativo. Planos e valores continuam sendo geridos pela administração; jogadores permanecem gratuitos quando essa é a configuração do site.

Para trocar uma assinatura recorrente existente por Pix, cancele a renovação atual e mantenha o acesso até o fim do período pago. A escolha do Pix ficará disponível quando for necessário pagar o próximo período. Um pedido de assinatura ou Pix ainda aberto deve ser conferido ou cancelado antes de iniciar outro.

## Confirmação e administração

- Somente a consulta autenticada do pagamento no Mercado Pago pode liberar acesso. O sistema confere conta recebedora, ambiente, método Pix, valor, moeda, referência e vínculo com a conta e o pedido.
- A criação usa uma chave de idempotência vinculada ao pedido. Cliques repetidos e recarregamentos recuperam a mesma cobrança. Respostas perdidas são recuperadas pela referência do pedido.
- Notificações repetidas atualizam o mesmo pagamento e não acrescentam meses extras. Estornos e contestações são refletidos no acesso após a conferência.
- Um pagamento aprovado durante o cancelamento mantém o período pago. Cancelar um Pix não solicita reembolso de um pagamento já confirmado.
- O CPF é enviado ao Mercado Pago para gerar o pagamento e não é armazenado nas tabelas do site. QR Code e dados pessoais retornados pelo provedor não são copiados integralmente para o histórico de pagamentos; a tela recebe apenas o código necessário para o pedido da própria conta.
- A exclusão de conta encerra códigos Pix pendentes e continua removendo os dados. Notificações tardias não restauram o acesso de uma conta em exclusão.
- A área administrativa identifica os pagamentos Pix no financeiro, nos detalhes da conta e no CSV. A estimativa de receita recorrente continua considerando contratos com renovação automática; a receita realizada inclui os Pix aprovados.

## Verificações locais

Os testes cobrem criação, recuperação de resposta perdida, confirmação manual e por webhook, repetição de notificações, validação de CPF, preços, permissões, troca entre métodos, cancelamento, expiração, reembolsos, exclusão de conta e layout no celular. Os testes usam um provedor local simulado, sem transferências ou cobranças reais.

```bash
npm run typecheck
npm test
npm run test:pix
npm run test:billing
npm run test:account
npm run build
```

Documentação oficial: [Pix via Payments API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix), [criar pagamento](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-payment/post) e [webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).
