# Atualização 053 — Correção do loop de salvamento no PostgREST 14

## Causa identificada

O banco retornou `40001: A regra de PV mudou`. Esse código foi usado incorretamente pelo projeto para conflitos de negócio. O PostgREST 14 pode repetir indefinidamente transações que recebem `40001`, pois o trata como falha transitória de serialização. Isso explica chamadas curtas repetidas, sem bloqueio, enquanto a requisição HTTP fica pendente. O limite de espera e o transporte pelo servidor das versões 051/052 não corrigiam essa causa no SQL.

A migração 053 substitui somente os códigos explicitamente lançados pelas 34 funções do projeto listadas no arquivo por `PT409` (HTTP 409). Conflitos continuam sendo recusados. Falhas reais de serialização do PostgreSQL não são alteradas. Não há mudança em tabelas, dados, permissões, propriedade das funções ou regras de PV.

Referência oficial: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

## Aplicar a correção

1. Feche as abas do site que estavam tentando salvar.
2. Abra uma nova consulta no SQL Editor do Supabase, com papel `postgres`, e execute TODO o arquivo `supabase/migrations/202611080053_business_conflicts_no_retry.sql`. O arquivo separado `correcao-salvamento-arkanis-053.sql` tem exatamente o mesmo conteúdo. É uma migração de correção, não o teste com rollback enviado anteriormente. Não execute `schema.sql` no banco existente.
3. Como já houve requisições em loop, reinicie o projeto pelo painel do Supabase depois da migração para encerrar as conexões antigas. Isso interrompe as conexões temporariamente. Não exclua nem recrie o projeto. Alterar a função não garante o encerramento das requisições antigas, conforme a documentação oficial.
4. Publique o código completo da versão 053: preserve as variáveis de ambiente, execute `npm ci`, `npm run typecheck` e `npm run build`, com Node.js 22 ou superior. Confira o endereço público em `NEXT_PUBLIC_SITE_URL`.
5. Reabra a ficha. A regra do mestre deve ser respeitada: se estiver em rolagem, abra Essência e use **Rolar PV dos níveis pendentes** antes de salvar. Se desejar dado cheio, o mestre deve escolher essa opção nas permissões da campanha.

A migração pressupõe as versões de banco até 050. Não existem migrações 051 e 052. A 053 pode ser reaplicada sem alterar dados. Não reaplique migrações antigas depois dela, pois algumas recriam funções com o código anterior; se isso acontecer, reaplique a 053 por último.

## Ajustes no aplicativo

- Clientes e rotas reconhecem PT409 como conflito; 40001 continua aceito para compatibilidade com versões anteriores e falhas reais.
- A ficha acompanha mudanças na regra de PV recebidas do mestre sem descartar os outros campos preenchidos.
- Ao receber a mensagem de regra de PV alterada, o editor recarrega as regras. Rolagens pendentes exigem ação do jogador; nenhum dado é rolado automaticamente e a escolha do mestre não é sobrescrita.
- Mantidos os rascunhos, os atalhos sem salto de rolagem e o salvamento autenticado pelo servidor.

Veja VALIDACAO-053.md para a validação. A migração não foi aplicada ao seu projeto de produção por este assistente.
