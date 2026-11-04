# Atualização 047 — integridade, consultas e manutenção

Este é o roteiro atual do Crônica. A aplicação e as regras existentes foram preservadas. O pacote completo inclui os arquivos de instalação e o componente de interface recuperados do histórico da mesma versão.

## Atualizar um projeto existente

1. Faça uma cópia do projeto e um backup do banco antes da atualização.
2. Substitua o código pela pasta `cronica` deste pacote, preservando suas variáveis de ambiente e a configuração do projeto na hospedagem.
3. Se o banco está na **046**, aplique **somente** `supabase/migrations/202611040047_integrity_and_maintenance.sql` no SQL Editor do Supabase.
4. Se está em uma versão anterior, aplique apenas as migrações ausentes, na ordem dos nomes, até a **047**. As migrações 001–046 foram preservadas.
5. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build` na pasta que contém `package.json`.
6. Publique pelo processo habitual e **recarregue as abas de todos os participantes**. As abas de versões anteriores usam as operações antigas e precisam ser atualizadas para adotar os novos controles de edição.
7. Confira **Administração → Visão geral → Atualizações e tarefas pendentes** e configure a manutenção abaixo.

Aplique o SQL antes de publicar o código 047. Não execute `schema.sql` em um banco existente. O código não executa SQL automaticamente nem altera suas credenciais.

## Instalação nova

Use Node.js 22 ou superior. Instale com `npm ci`, copie as variáveis de exemplo para sua configuração local e preencha os valores do seu projeto. Configure Auth, URLs de retorno, Storage, Realtime e pagamentos seguindo os guias já incluídos.

Para um banco vazio, aplique as **47 migrações em ordem** ou use `supabase/schema.sql`, que contém a mesma sequência. Escolha apenas um desses caminhos. O arquivo completo é exclusivo para uma base nova.

## O que mudou

- Campanhas e lugares recebem gravação com a versão esperada. Edições antigas são recusadas sem perder o texto do formulário; um lugar excluído não é recriado por um editor antigo. Repetir uma gravação já confirmada com o mesmo conteúdo recupera a confirmação sem regravar o registro.
- Campanhas, lugares e NPCs oferecem recuperação de rascunhos locais. Imagens escolhidas no computador precisam ser selecionadas novamente; o rascunho conserva os campos de texto e a versão que foi editada.
- O início carrega contagens e dados básicos. Fichas completas, NPCs e construção de mundo são consultados nas telas que precisam deles, com filtro por campanha quando aplicável.
- Todas as listas do workspace e as tabelas de inventário, magias e atributos são paginadas. Eventos atualizam os recursos afetados; uma leitura completa periódica serve como recuperação de sincronização.
- A troca ou exclusão de uma referência de imagem cria uma tarefa durável de limpeza. Imagens ainda usadas por tokens, mural ou histórico são conservadas.
- O processamento de pagamentos e mídias trabalha com prazo de execução, tentativas e retomada. A administração mostra o estado da manutenção e permite retomar limpezas que esgotaram as tentativas.
- Os diálogos da mesa, a sincronização Realtime, a geometria e o painel de ações do mestre foram separados em módulos. As exportações públicas dos componentes existentes foram mantidas.
- O recebimento de JSON e de uploads administrativos limita bytes durante a leitura do corpo da requisição.

## Manutenção frequente

O endpoint protegido continua sendo:

```
GET https://SEU_SITE/api/billing/cron
Authorization: Bearer SEU_CRON_SECRET
```

`CRON_SECRET` deve ter pelo menos 32 caracteres e ser o mesmo na hospedagem e no agendador. Somente o servidor usa a chave de serviço do Supabase. Nunca coloque essas duas chaves em variáveis `NEXT_PUBLIC_*`.

O `vercel.json` padrão preserva o agendamento diário, compatível com o plano Hobby. Para recuperação em intervalos menores, escolha uma das opções:

### GitHub Actions, sem alterar o plano da Vercel

O arquivo `.github/workflows/maintenance.yml` está pronto para solicitar a manutenção a cada cinco minutos. No repositório GitHub que contém o projeto:

1. Cadastre os secrets `CRONICA_SITE_URL` (origem HTTPS do seu site) e `CRON_SECRET`.
2. Cadastre a variável de repositório `CRONICA_MAINTENANCE_ENABLED` com valor `true`.
3. Ative Actions e execute **Manutenção do Crônica → Run workflow** uma vez para conferir.

O workflow permanece desativado enquanto essa variável não for definida. O agendamento do GitHub é aproximado e pode atrasar; as tarefas persistentes permitem retomar o trabalho. Em repositórios públicos, acompanhe também a política do GitHub para desativação de agendamentos por inatividade. Falhas retornam HTTP 503 e aparecem como falhas da execução, conforme suas notificações do GitHub.

### Agendador da hospedagem

Se seu plano admite cron mais frequente, use o exemplo `config/vercel-frequent.json` como `vercel.json`, ou configure o endpoint em outro agendador autorizado. No exemplo, o intervalo é de cinco minutos. Não use esse exemplo no Vercel Hobby, cujo cron admite uma execução diária.

Não é necessário ativar dois agendadores frequentes. O agendamento diário pode permanecer como reserva; as leases e a idempotência protegem tarefas sobrepostas. Nenhum agendador externo ou configuração de produção foi ativado durante a preparação deste pacote.

## Limpeza de mídias

- Referências substituídas ou removidas aguardam pelo menos **24 horas** antes da tentativa de limpeza.
- Arquivos abandonados e reservas não confirmadas da biblioteca podem ser recolhidos após o período de proteção de **48 horas**, dependendo do ciclo do agendador.
- A manutenção verifica referências novamente, preservando imagens usadas por tokens, mural e eventos de sessões. Uma imagem utilizada no histórico continua ocupando espaço intencionalmente.
- A remoção física passa pela API do Storage. O SQL consulta metadados e administra a fila; não apaga os metadados do Storage diretamente.
- A política de upload inclui uma cota preventiva de **512 MiB e 10.000 objetos por conta** nos dois buckets do Crônica. A biblioteca pessoal admite até **1.000 reservas/imagens**. As exclusões continuam permitidas mesmo acima da cota. A contagem usa os metadados de tamanho e autoria mantidos pelo Storage; uploads em trânsito podem ultrapassar a cota preventiva. Para mudar os limites, prepare uma migração adicional compatível com seu plano.
- Falhas recebem espera progressiva. Depois de 12 tentativas, a tarefa exige atenção e pode ser retomada pela administração.

Aplique a 047 sem executar manualmente funções de limpeza e aguarde o período de proteção. O objetivo é retirar arquivos sem uso, preservando as referências ainda existentes.

## Conferir a instalação

```sql
select
 to_regprocedure('public.save_campaign_checked(jsonb,timestamptz)') is not null as campanhas_047,
 to_regprocedure('public.save_world_entry_checked(jsonb,timestamptz)') is not null as mundo_047,
 to_regprocedure('public.get_workspace_summaries()') is not null as consultas_047,
 to_regprocedure('public.lease_media_cleanup(integer)') is not null as manutencao_047;
```

Os quatro resultados devem ser `true`. A chamada administrativa `site_maintenance_health()` exige uma sessão de administrador; a tela de administração já a utiliza.

## Compatibilidade e recuperação

A migração 047 é reaplicável e não limpa dados ao ser executada. A remoção de mídia só ocorre por tarefa posterior e após as verificações descritas. As funções e tabelas anteriores continuam disponíveis para compatibilidade, mas os formulários novos utilizam as operações com versão. Atualize as abas abertas.

Se um formulário informar conflito, copie ou recupere seu rascunho, recarregue o registro atual e confira as diferenças antes de editar novamente. Recuperar o rascunho conserva a versão antiga para impedir uma sobrescrita automática.

Os guias históricos continuam incluídos. A antiga sequência de atualização foi preservada em `docs/historico/LEIA-ME-ATUALIZACAO-046.md`; para a instalação atual, siga este arquivo.
