# Conferência Mercado Pago: revisão do `provider_400`

## Como aplicar

Esta revisão altera o código de confirmação e **não acrescenta uma migração SQL**. As migrações 001–031 continuam intactas.

1. Atualize os arquivos do projeto com este pacote, preservando o `.env.local` e as variáveis da hospedagem.
2. Faça um **novo deploy na Vercel**. Se o deploy usa Git, envie os arquivos pelo processo que já utiliza e aguarde a publicação dessa versão.
3. Entre na conta que fez a contratação e abra **Minha assinatura → Conferir pagamento**. A conferência recupera a contratação existente e seus pagamentos; não inicia outra assinatura.
4. Caso ainda apareça erro, a mensagem agora inclui uma referência como `MP_INVOICE_SEARCH_400`. Essa referência identifica a operação recusada e permite continuar o diagnóstico sem copiar credenciais.

Se já aplicou a 031, não há outro SQL para executar nesta revisão. Se ainda usa um banco anterior à 031, siga a ordem descrita em [LEIA-ME-ATUALIZACAO.md](LEIA-ME-ATUALIZACAO.md).

## O que foi revisto

O `provider_400` confirma que uma consulta feita ao Mercado Pago recebeu HTTP 400. O código anterior devolvia a mesma mensagem para todas as operações e descartava a identificação da consulta que falhou. A captura recebida não continha o corpo original dessa resposta do Mercado Pago.

- As primeiras buscas agora enviam somente o filtro necessário: assinatura, pagamento ou e-mail do pagador. Foi removido o `limit=100` fixo dessas consultas.
- As páginas seguintes usam o tamanho informado pelo provedor e o número de registros efetivamente recebidos. Uma página com menos de 100 registros não encerra a busca prematuramente.
- Se o provedor identificar uma rejeição do tamanho de página, a consulta é refeita sem esse tamanho explícito, mantendo o filtro e a posição.
- Páginas repetidas ou inválidas são detectadas para evitar buscas sem fim. Uma lista temporariamente vazia permanece sem conceder acesso por si só.
- Uma cobrança com falha não impede a verificação de outras cobranças da mesma assinatura. O erro continua sendo informado; pagamentos efetivamente verificados podem ser registrados.
- Pagamentos conhecidos continuam sendo rechecados para reembolsos mesmo se a busca geral de faturas falhar.
- Consultas de leitura têm uma repetição curta para HTTP 429 e falhas temporárias 5xx. A criação da assinatura e o cancelamento mantêm o controle de tentativas já existente.
- Mensagens e registros internos incluem a operação envolvida. A resposta da API informa `diagnostic`, `operation`, `provider_status` e uma classificação limitada do motivo, sem retransmitir textos privados retornados pelo provedor.

As validações de conta recebedora, referência, valor, moeda, ambiente e vínculo entre assinatura, fatura e pagamento continuam necessárias. O acesso depende de um pagamento aprovado e verificado.

## Referências de diagnóstico

| Referência                   | Consulta envolvida                                    |
| ---------------------------- | ----------------------------------------------------- |
| `MP_SUBSCRIPTION_LOOKUP_400` | Consulta da assinatura pelo ID.                       |
| `MP_SUBSCRIPTION_SEARCH_400` | Busca da assinatura pelo pagador.                     |
| `MP_INVOICE_SEARCH_400`      | Busca das cobranças da assinatura ou de um pagamento. |
| `MP_INVOICE_LOOKUP_400`      | Consulta de uma fatura pelo ID.                       |
| `MP_PAYMENT_LOOKUP_400`      | Consulta do pagamento pelo ID.                        |

`reason` classifica apenas erros conhecidos de parâmetros, como paginação, filtro de assinatura ou filtro de pagamento. Não contém o texto completo recebido do Mercado Pago. Se o erro persistir após o deploy, registre essa referência e o campo `reason`; eles ajudam a identificar qual consulta ainda precisa ser corrigida.

## Verificação

Os testes locais incluem um provedor que rejeita `limit=100`, retorna páginas de 20 registros e coloca o pagamento aprovado depois da primeira página. Também cobrem diagnóstico seguro, falhas isoladas de cobranças, confirmação de pagamento, reembolsos e controle de tentativas.

Os testes usam dados locais e um provedor simulado, sem cobranças reais. A atualização ainda precisa ser publicada no seu site para verificar o resultado na contratação já realizada.

Documentação oficial: [busca de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get), [busca de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/search-preapproval/get) e [gestão de pagamentos recebidos](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/payment-management).
