# Alterações 053

- Migração 053 troca ERRCODE explícito 40001 por PT409 em uma lista fechada de 34 funções do projeto, preservando assinaturas, corpo funcional, permissões e SECURITY DEFINER/INVOKER. Migração idempotente e notificação de recarga de schema.
- Mapeamento HTTP e tratamento de conflitos atualizado nas rotas de personagens, conta, administração, cobrança e repositório do atlas.
- Editor Arkanis sincroniza o método de PV quando as regras carregadas mudam. Conflito de regra provoca atualização dos dados e mantém a edição local.
- Regressão de banco para regra de PV divergente, versão desatualizada, rollback, ACL e reaplicação.
- Regressão de navegador para troca de regra durante edição, resposta PT409, rolagem pendente e salvamento posterior.
