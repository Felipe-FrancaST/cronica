# Correção 035 — criação de campanhas

Esta correção resolve o erro:

```text
new row violates row-level security policy for table "campaigns"
```

## Aplicar no site existente

1. Abra o **SQL Editor** do seu projeto no Supabase.
2. Execute o conteúdo completo de `supabase/migrations/202610220035_campaign_creation_rls_fix.sql`.
3. Recarregue o site e crie a campanha novamente.

A correção passa a valer assim que o SQL termina. O código já publicado usa o mesmo fluxo de salvamento; um novo deploy é opcional para esta correção. O ZIP atualizado inclui a migração, o export de instalação nova e os testes de regressão.

Se a base já está na **034**, execute somente a **035**. Em bases anteriores, siga a ordem das migrações ausentes. A 035 usa as funções de assinatura instaladas pela 029; a oficina de mapas continua sendo habilitada pela 034. Use `schema.sql` exclusivamente em uma instalação nova.

## Causa identificada

O aplicativo salva campanhas por `upsert`, uma operação que cria um registro novo ou atualiza o existente. O PostgreSQL também confere a regra de leitura durante essa operação.

A política instalada na 029 consultava uma função que procurava a campanha na própria tabela. Durante a criação, essa função ainda não enxergava a linha nova. O resultado era uma recusa de permissão mesmo para um mestre com pagamento aprovado, cortesia ou acesso gratuito autorizado.

A 035 permite avaliar o proprietário diretamente na linha que está sendo criada, junto com o acesso de mestre verificado pelo banco. A leitura de campanhas por membros continua usando a função de permissões existente.

## Permissões verificadas

- Mestres com pagamento aprovado, cortesia ou acesso gratuito autorizado conseguem criar e editar suas campanhas.
- Repetir o salvamento mantém a mesma campanha e permite gravar sua capa.
- Jogadores acessam somente as campanhas em que participam e continuam sem permissão para editá-las.
- Outros mestres não podem criar campanhas em nome de outra pessoa ou editar campanhas alheias.
- Acesso expirado ou estornado, bloqueio de conta, manutenção e limites de campanhas continuam sendo aplicados.
- Reaplicar a migração preserva os registros existentes.

As migrações **001–034 foram preservadas**. A 035 altera apenas a política de leitura de `campaigns`; os dados são mantidos.

## Validação

`tests/campaign-write-database.test.ts` reproduz a falha antiga e testa a correção em PostgreSQL local, incluindo assinatura, cortesia, acesso gratuito, membros, contas bloqueadas e limites do plano.

`npm run test:campaigns` verifica o formulário de criação e a edição pelo site com uma API local apoiada no mesmo PostgreSQL. Os testes não acessam seu Supabase nem fazem cobranças reais.
