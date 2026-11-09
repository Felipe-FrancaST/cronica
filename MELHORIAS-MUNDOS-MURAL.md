# Crônica — Atlas do Mundo e integração com o Mural

## O que mudou

- Removida a aba **Locais** da navegação da campanha. Endereços antigos de `/locais` agora redirecionam para `/mundo`, preservando o acesso aos registros.
- A área **Mundo** ganhou uma visão de atlas por campanha, com resumo de regiões/cidades/locais, busca, filtros e criação direta por tipo.
- Regiões são exibidas com as cidades e locais associados. Registros sem região ficam organizados numa seção própria. As regiões podem ser expandidas/recolhidas.
- Criar uma cidade ou local **dentro da região** já preenche o vínculo correto; também é possível selecionar/mudar a região no editor.
- Formulário de criação e edição reorganizado em identidade, descrição, imagem, visibilidade e notas secretas. Anotações privadas ficam recolhidas por padrão.
- Cartões e detalhes respeitam a proporção original da arte, sem cortes agressivos.
- O mestre pode enviar uma região, cidade ou local diretamente ao Mural de uma sessão **planejada ou em andamento**, como rascunho ou cartão visível.
- No editor do Mural, a seleção de "Lugar do mundo" passou a listar regiões, cidades e locais, além de NPCs em seu fluxo próprio.
- Imagens de registros do mundo (inclusive registros privados) são **copiadas para a pasta de mídia do Mural** antes da publicação. Isso evita links inacessíveis aos jogadores e permite que o mestre controle a visibilidade independentemente do registro original.
- Os cartões do Mural agora acomodam retratos e mapas panorâmicos: arte inteira em primeiro plano, ambiente difuso ao redor e visualização ampliada proporcional.

## Como usar

1. Abra **Campanha → Mundo** e crie uma região.
2. No cartão da região, escolha **Cidade nesta região** ou **Local nesta região**. A região já vem selecionada.
3. Use **Explorar** para ler, **Editar** para alterar e o ícone do Mural para compartilhar uma apresentação.
4. Na publicação, escolha uma sessão, o título e se os jogadores terão acesso ao cartão agora ou se ficará em rascunho.
5. Também é possível criar o cartão diretamente na **Mesa → Mural → Lugar do mundo**.

## Compatibilidade e privacidade

- **Não requer uma nova migração SQL**: as regiões, cidades e locais usam as tabelas existentes; os cartões utilizam a estrutura atual do Mural.
- A integração de regiões e cidades é uma **publicação de apresentação/snapshot** (o Mural não possui chave estrangeira para esses dois tipos). Cartões publicados são independentes e não se atualizam silenciosamente quando o mestre muda o cadastro. Registros do tipo *local* preservam também o vínculo já suportado pelo banco.
- O cartão recebe apenas categoria, descrição, observações públicas, título e imagem. Segredos e notas privadas do mestre **não são copiados**.
- A publicação exige uma sessão planejada ou ativa. Cartões da sessão encerrada não são alterados.
- Excluir uma região não exclui suas cidades/locais; eles permanecem sem região, conforme o comportamento existente do banco.

## Verificação e implantação

- Três testes unitários de hierarquia, busca e privacidade executados com êxito.
- Análise sintática dos arquivos TypeScript/TSX modificados: sem erros.
- Checagem de tipos dos arquivos alterados: nenhum diagnóstico relativo a esses arquivos na checagem local; a verificação completa do aplicativo continua bloqueada por dependências de tipos `@types/three`, `@types/stats.js`, `@types/webxr` ausentes no pacote e ferramentas nativas do Windows incompatíveis com o Linux.
- No ambiente do projeto, instale as dependências corretamente usando `npm ci` e execute `npm run typecheck`, `npm test` e os testes de interface correspondentes antes de publicar em produção.
