# Atualização 052 — Novo caminho de salvamento de Arkanis

## Instalação

1. Substitua o código pela pasta `cronica`, preservando suas variáveis de ambiente.
2. Confira `NEXT_PUBLIC_SITE_URL`: deve ser o endereço público exato utilizado para abrir o site, incluindo `https://` e sem caminhos adicionais. As variáveis públicas de URL e chave do Supabase continuam sendo necessárias.
3. Execute `npm ci`, `npm run typecheck` e `npm run build` com Node.js 22 ou superior e publique o projeto completo, incluindo a nova rota `/api/characters/save`.
4. Recarregue as abas abertas e teste o salvamento.

Não há migração SQL nesta versão. O banco permanece na migração 050. Não execute `schema.sql` em banco existente. Esta versão requer a hospedagem Next.js com servidor, já utilizada pelas outras rotas do projeto; não basta publicar somente arquivos estáticos.

## O que mudou

A ficha de Arkanis é enviada ao servidor do site, que autentica a sessão por cookie e chama `save_arkanis_character` no Supabase com a identidade do usuário. A requisição de salvar deixa de sair diretamente do navegador para o domínio do Supabase. Não há uso de chave administrativa ou bypass das políticas do banco.

A mesma função SQL, as validações, o controle de versão e as permissões continuam em vigor. Não há repetição automática do salvamento nem uma segunda tentativa pelo transporte antigo. A imagem continua usando o fluxo de envio de retrato existente.

O servidor tem prazo próprio de resposta e devolve um erro JSON com etapa, código e referência quando consegue identificar a falha. A validação de sessão dessa rota ocorre dentro do prazo da própria rota, sem depender da validação prévia do proxy. Os dados da ficha não são registrados no log de diagnóstico.

## Se aparecer um aviso

- `sem_resposta_site`: o navegador não recebeu a resposta da rota do site no prazo. Pode envolver a hospedagem ou a comunicação com ela.
- `sem_resposta_sessao`: o servidor não conseguiu concluir a etapa de sessão no prazo.
- `sem_resposta_banco`: o servidor não conseguiu concluir a etapa do banco no prazo.
- `sessao`: a sessão não foi confirmada; entre novamente.
- `origem`: confira se `NEXT_PUBLIC_SITE_URL` corresponde ao endereço utilizado.
- `40001`: houve mudança de versão; reabra a ficha para conferir os dados mais recentes.
- `42501`: o banco recusou a operação por permissão.
- `PGRST202`: a API do banco não encontrou a função esperada.

Envie o aviso completo com a referência entre colchetes, se houver. Ela permite localizar o evento `[character-save]` nos logs da hospedagem. Não é necessário copiar tokens ou cookies. Em caso de resposta perdida, confira a ficha reaberta antes de repetir a operação. O rascunho continua disponível conforme a versão 051.

## Limite do diagnóstico

As capturas enviadas mostraram chamadas ativas do PostgREST de aproximadamente 10 a 22 ms, sem espera por bloqueio naquele instante. Isso não demonstra a causa da espera no navegador nem exclui falhas intermitentes. A 052 oferece outro caminho de comunicação e diagnóstico por etapa; a validação no ambiente publicado ainda precisa ser feita após a atualização.
