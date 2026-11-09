# Crônica · Mundo hierárquico e Mural visual (055)

## Mudanças implementadas

- **Mundo**: Região → Cidade → Local. Locais também podem pertencer **diretamente a uma região** ou ficar independentes.
- No formulário de **Local**, o campo **Onde fica este local?** permite selecionar uma região **ou** uma cidade (escolha exclusiva); a cidade pode ter sua própria região.
- As regiões mostram suas cidades com locais aninhados, e locais vinculados diretamente à região aparecem em seção separada. Cidades sem região também podem conter seus locais.
- O visualizador de **Região** permite abrir cidades e locais sem sair do modal. Dentro de **Cidade**, é possível abrir cada local, usando o botão **Voltar** para retornar ao nível anterior.
- O cadastro permite criar um local **de dentro da cidade** com o vínculo pré-selecionado. A pesquisa encontra locais aninhados e exibe seus pais no contexto.
- **Mural**: aparência de quadro, cartões orientados por imagens, enquadramento sem corte, indicador visual de destaque e de rascunho, filtros, busca e layout responsivo.
- Ao abrir um cartão, ele **amplia com uma transição suave**; na leitura é possível avançar/voltar entre os cartões filtrados. O leitor mostra imagens inteiras, NPCs, notas e o visualizador de **mapas com marcações** já existente.
- A publicação no Mural mantém o modelo de **cópia pública do conteúdo**: apenas os campos de apresentação e imagem são enviados; notas privadas e segredos não são compartilhados.
- A exclusão de uma cidade **não exclui seus locais**; eles tornam-se independentes. Mover uma cidade para outra região faz seus locais acompanharem automaticamente a cidade, sem regravar os locais.

## Importante: atualização do Supabase necessária

**Esta versão exige executar a migração `055`** no Supabase real, diferentemente da atualização anterior:

1. Faça backup do banco antes de atualizar.
2. Abra o **Supabase → SQL Editor** do projeto da sua campanha.
3. Execute **somente** `supabase/migrations/202611090055_world_location_city.sql` (caso as migrações anteriores já estejam instaladas).
4. Atualize o código do site e recarregue a página. Não execute `supabase/schema.sql` em um banco existente — esse arquivo é uma exportação para instalação nova.

A migração acrescenta `world_locations.city_id`, estabelece vínculo por `(city_id,campaign_id)`, garante que o local só tenha uma associação (cidade **ou** região), adapta as RPCs de salvamento e mantém os locais quando a cidade é removida. **Não exclui nem desloca vínculos regionais já existentes.**

## Verificações executadas

- `node scripts/verify-world-city-055.mjs`: todas as migrações executadas em PostgreSQL/PGlite. Checados criação, atualização, idempotência, conflito de versão, exclusividade, integridade entre campanhas, acesso do jogador e exclusão de cidade.
- Testes adicionais em `tests/world-hierarchy.test.ts` cobrem a organização profunda, busca de locais, regiões alteradas e cidades independentes.
- TypeScript e formatação dos componentes novos checados. A verificação completa do projeto apresenta erros pré-existentes por dependências ausentes (`three`, `pdf-lib`) no pacote local, e testes end-to-end no navegador precisam ser executados no ambiente com `npm ci` compatível.

## Como usar

**Mundo → Nova região → Cidade nesta região → Criar local nesta cidade**. Também pode optar por **Local direto na região**. Para compartilhar, use **Enviar ao mural** no cadastro e escolha a sessão, ou acesse a tela do Mural e adicione um cartão do tipo **Lugar do mundo**.

O Mural é uma apresentação da sessão e não edita automaticamente os lugares originais: uma publicação é um *snapshot*; atualizações posteriores do cadastro precisam ser publicadas novamente se o mestre desejar.
