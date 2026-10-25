# Bibliotecas de tokens, símbolos e fundos

## Instalação

Execute `supabase/migrations/202610250045_map_asset_libraries.sql` depois da migração 044 e publique o código atualizado. As migrações anteriores foram preservadas. A administração utiliza a variável secreta `SUPABASE_SERVICE_ROLE_KEY`, já usada pelos pagamentos e exclusão de conta; ela nunca deve ser pública.

## Administrador

Na administração, abra **Biblioteca de mapas**. Escolha **Símbolos**, **Tokens** ou **Fundos para grids** e use **Adicionar ao sistema**. Dê um nome, etiquetas opcionais e escolha a imagem. O ajuste de recorte preserva transparência em PNG/WebP. Os arquivos e seus registros ficam salvos online.

Os recursos publicados aparecem para os mestres com acesso ao site, seguindo as configurações de assinatura existentes. É possível editar nome e etiquetas ou arquivar um recurso. Arquivar remove a opção de novas escolhas e preserva os mapas que já o utilizam. Para publicar uma imagem diferente, adicione um novo recurso; as imagens de mapas existentes não são substituídas silenciosamente.

## Biblioteca pessoal do mestre

Na Oficina de mapas, escolha **Símbolos** ou **Tokens** e abra **Imagens do sistema e minha biblioteca**. Use **Enviar para minha biblioteca**. Depois escolha o recurso e clique no mapa para posicioná-lo. Os controles de tamanho, rotação, opacidade, camadas, cópia e desfazer continuam funcionando.

A biblioteca pessoal pertence à conta do mestre e pode ser reutilizada nas campanhas dessa conta. Outros mestres, jogadores e administradores não conseguem listar ou baixar esses arquivos pessoais. A biblioteca tem busca e paginação; os nomes são ordenados sem separar palavras por acentos.

O PNG exportado e a imagem enviada ao grid incluem os símbolos personalizados. Os tokens de planejamento seguem a opção de exportação já existente; eles não são gravados no fundo de combate. O arquivo JSON guarda referências às bibliotecas da conta, por isso a restauração das imagens depende do acesso aos recursos correspondentes.

## Fundos oferecidos pelo sistema

Ao criar um mapa tático ou em **Configurar mapa**, abra **Fundos oferecidos pelo sistema** e escolha uma imagem publicada pelo administrador. Ela entra no fluxo normal da imagem do mapa, com os ajustes existentes. O mestre também pode continuar enviando seu próprio fundo pelo campo **Imagem do mapa**.

Ao aplicar um fundo, é criada uma imagem da campanha, com as permissões do cenário. Jogadores veem a imagem do mapa compartilhado sem ganhar acesso à biblioteca pessoal do mestre. O catálogo do sistema continua independente das campanhas.

## Armazenamento e fluidez

Imagens são mantidas em armazenamento privado; o banco guarda seus registros e referências. Miniaturas menores são usadas na biblioteca, sem baixar todos os fundos em resolução completa. Os ícones são preparados com até 512 pixels, preservando a proporção; fundos podem chegar a 4.096 pixels e são ajustados para envio. São aceitos PNG, JPG e WebP de até 5 MB antes da preparação.

Cada mapa mantém o limite existente de 1.800 peças e aceita até 96 imagens personalizadas diferentes. Várias peças podem reutilizar a mesma imagem sem consumir novas cópias. As imagens carregadas são reaproveitadas no desenho e nas exportações.

Excluir uma conta remove seus recursos pessoais e respectivos arquivos. Recursos publicados pelo administrador pertencem ao catálogo do site e não desaparecem quando a conta de quem os enviou é excluída.

## Validação

A compilação de produção, a verificação TypeScript e os 573 testes automatizados de regras, banco e serviços passaram. Também foram aprovados 40 testes de navegador: os três novos fluxos de publicação, biblioteca pessoal/exportação e autorização, mais 37 verificações do editor, controles do mestre, visão dos jogadores e desempenho. A revisão visual incluiu o catálogo administrativo e um mapa com imagens personalizadas.

Os testes do banco verificam isolamento entre contas, permissões de Storage, referências de imagens, arquivamento, exclusão de conta e reaplicação da migração. Para repetir o fluxo de imagens localmente, execute `npm run test:map-assets`. Os testes usam dados locais e não realizam uploads no projeto Supabase de produção.
