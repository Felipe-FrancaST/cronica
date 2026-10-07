# Atualização: limpeza e melhorias

Este pacote mantém a pasta `cronicarpg`. Não há alteração de banco nesta revisão.

1. Extraia o ZIP em uma pasta nova.
2. Copie seu `.env.local` atual para a pasta `cronicarpg`. As variáveis existentes da Vercel permanecem iguais.
3. Abra essa pasta no terminal e execute `npm ci` e `npm run build` com Node.js 22 ou superior.
4. Atualize o código pelo processo de publicação que já utiliza e recarregue as abas abertas.

**Não é necessário executar SQL.** Todos os SQLs que já existiam foram preservados, inclusive as 18 migrações e `schema.sql`. O modelo `supabase/templates/v17-combat.sql`, antes guardado dentro de um JSON, agora está disponível como arquivo com o mesmo conteúdo.

O pacote remove builds, caches, configuração local, arquivos temporários e resultados antigos de testes. Mantém dependências fixadas pelo lockfile, testes, geradores e guias úteis. A Vercel gera um build novo durante a publicação.

As melhorias incluem carregamento das seções da campanha sob demanda, imagens com fallback, abas acessíveis pelo teclado, atalho para o conteúdo e prevenção de imports sem uso. O relatório completo está em [docs/limpeza-e-melhorias.md](docs/limpeza-e-melhorias.md).
