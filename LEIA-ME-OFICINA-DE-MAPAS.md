# Oficina de mapas — atualização 034

O mestre agora tem uma oficina de cartografia em **Oficina de mapas**, no menu principal e dentro de cada campanha. A biblioteca reúne os mapas das campanhas que ele administra, com busca, filtro, miniaturas e paginação. Jogadores não acessam os documentos de edição nem as notas privadas.

## Instalar

1. Se a base já está na **033**, execute somente `supabase/migrations/202610220034_campaign_map_workshop.sql` no SQL Editor do Supabase. As migrações 001–033 permanecem idênticas à versão anterior.
2. Se faltam migrações anteriores, execute apenas as ausentes, na ordem numérica, até a 034. Não execute `schema.sql` em uma base existente.
3. Atualize os arquivos do projeto, preservando seu `.env.local` e as variáveis já configuradas na Vercel.
4. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Depois faça o deploy pelo processo habitual.

Não há novas variáveis de ambiente, dependências de produção ou serviços externos para os mapas. A migração cria a biblioteca privada, funções de salvamento e o envio de imagens para o bucket `campaign-media` já existente. As assinaturas continuam controlando o acesso de mestre.

## Criar um mundo

Escolha **Criar mapa**, a campanha e o nome. Há oito pontos de partida: ilha, arquipélago, continente, vale de montanhas, terras áridas, cidade murada, masmorra e tela em branco. A prévia acompanha a escolha. Em **Geração e dimensões**, altere a semente ou sorteie outra; a mesma combinação de modelo, semente e dimensões reproduz o terreno.

O mapa fica ligado à campanha escolhida. A biblioteca permite duplicar um mapa existente ou importar um backup `.cronica-map.json` como novo mapa. A exclusão da oficina não remove cenários já enviados à Mesa.

## Ferramentas

| Ferramenta     | Possibilidades                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selecionar     | Mover elementos, editar propriedades, duplicar, excluir e selecionar vários com Shift ou arrastando uma área.                                               |
| Navegar        | Arrastar a vista, aproximar com a roda e usar dois dedos em telas com toque.                                                                                |
| Pintar terreno | 22 materiais, incluindo água, praia, floresta, neve, lava, cultivo e pisos; cores editáveis, pincéis circulares ou quadrados, tamanho e altura.             |
| Apagar terreno | Restaurar o material inicial nas células pintadas.                                                                                                          |
| Preencher      | Trocar uma área conectada do mesmo terreno, com opção de alterar somente a altura.                                                                          |
| Conta-gotas    | Copiar terreno e altura de uma célula e voltar ao pincel.                                                                                                   |
| Símbolos       | Montanhas, árvores, cidades, castelos, ruínas, portais, cavernas, navios, baús, portas e outros símbolos vetoriais; busca, tamanho, cor e pintura contínua. |
| Tokens         | 12 ícones, nome, número, tamanho, cor e facção; o número avança após cada colocação. Também é possível usar o nome de um personagem da campanha.            |
| Rotas          | Estradas, trilhas, rios, fronteiras, muralhas e setas, com largura, cor e curvas.                                                                           |
| Regiões        | Áreas poligonais com contorno, cor e transparência.                                                                                                         |
| Textos         | Nomes de lugares e legendas com tamanho, cor, rotação, fonte e itálico.                                                                                     |
| Medir          | Distância entre dois pontos segundo a escala configurada no mapa.                                                                                           |

Rotas e regiões são desenhadas por cliques. **Enter**, duplo clique ou **Concluir traçado** finaliza. **Escape** cancela. Para alterar um traçado, selecione-o e arraste seus pontos dourados. O comprimento das rotas curvas é aproximado ao longo da curva.

Os tokens da oficina servem para planejamento e viagens. As peças, fichas e regras de combate continuam na Mesa.

## Painel e apresentação

O painel lateral pode ser recolhido e tem quatro abas: **Ferramenta**, **Seleção**, **Camadas** e **Mapa**. O canvas ocupa o espaço restante. No celular, recolha o painel para desenhar com mais espaço. Há tela cheia, zoom, enquadramento e encaixe na malha de terreno.

As seis camadas podem ser reordenadas, ocultadas, bloqueadas e ter sua opacidade ajustada. A lista de elementos fica em **Camadas → Elementos do mapa**, com busca e paginação. Camadas bloqueadas impedem alterações; itens ocultos ficam fora da imagem exportada.

Em **Mapa**, personalize o papel, relevo, rosa dos ventos, escala e grade quadrada ou hexagonal. A distância por célula usa a malha de terreno de 16 unidades de desenho; a grade hexagonal é uma referência visual. As unidades disponíveis são metros, quilômetros e milhas. As notas do mestre são privadas. O redimensionamento permite escalar o conteúdo ou ampliar/cortar a área de desenho, com possibilidade de desfazer.

## Salvamento e recuperação

O salvamento automático começa cerca de 1,3 segundo depois da última edição e pode ser desligado. **Salvar** ou **Ctrl S** grava imediatamente. O status indica alterações pendentes e salvamento confirmado; falhas permanecem visíveis e permitem tentar novamente.

Alterações locais têm um rascunho no navegador, identificado por conta, campanha, mapa e aba. Ao reabrir um mapa com alterações não salvas, a oficina oferece recuperar o rascunho. Se o servidor já tem uma versão mais nova, o rascunho pode virar uma cópia. O navegador pode bloquear ou esgotar esse armazenamento; nesse caso, a oficina avisa e o salvamento no servidor continua disponível.

O banco confere a revisão antes de gravar. Uma aba antiga não sobrescreve outra edição: o mestre pode carregar a versão salva ou criar uma cópia com suas alterações. A confirmação de um salvamento anterior preserva as edições feitas enquanto a requisição estava em andamento. Repetir uma gravação cuja resposta se perdeu não cria revisões extras com conteúdo idêntico.

Desfazer/refazer é local à sessão de edição. O histórico é limitado por memória e quantidade de ações; o salvamento no servidor guarda a versão atual, sem um histórico permanente de versões.

## Exportar e usar na Mesa

- **PNG:** imagem das camadas visíveis, com opção de incluir tokens visíveis. Não inclui as notas privadas. A resolução é limitada a 4.096 px por lado.
- **Backup editável:** arquivo JSON com terrenos, elementos, camadas ocultas e notas privadas. Guarde-o com o cuidado adequado às anotações do mestre. Para continuar editando, use **Importar** na biblioteca.
- **Usar na Mesa:** escolha um capítulo planejado ou em andamento, as colunas/linhas e os metros por célula. A oficina salva a versão atual, cria um cenário e envia sua arte como fundo. A imagem preserva a proporção, com margens quando necessário. Tokens de planejamento, grade da oficina, barra de escala e notas privadas ficam fora desse fundo.

O cenário enviado é uma cópia da arte daquela versão. Editar a oficina depois não altera um combate existente. Repetir o envio da mesma revisão para o mesmo capítulo e calibração retoma o mesmo cenário; isso permite concluir um upload interrompido sem duplicá-lo. Capítulos encerrados não recebem novos cenários. Depois de criar, abra a Mesa e escolha o cenário pelo nome.

Na demonstração local, os mapas ficam no navegador e podem ser exportados. O envio à Mesa exige o Supabase conectado.

## Limites e desempenho

Cada campanha pode guardar até 100 mapas. Cada mapa aceita dimensões de 320 a 4.096 por lado, até 1.800 elementos e 20.000 pontos distribuídos entre rotas e regiões, com até 300 pontos por traçado. O documento no banco e o arquivo importado têm limite de 2 MB; combinações muito detalhadas podem atingir o tamanho antes do limite de elementos.

O editor desenha com Canvas 2D, reutiliza o terreno em cache, compartilha imagens de símbolos repetidos com limite de memória e atualiza a tela por `requestAnimationFrame`. Traços e arrastes só entram no estado do React quando concluídos. A biblioteca consulta miniaturas e metadados; o documento completo é carregado ao abrir o editor. Não há chamadas de pagamento ou serviços de geração de imagens na criação dos mapas.

Os documentos são removidos ao excluir a campanha ou a conta que a possui. Imagens enviadas à Mesa usam as pastas de cenários já cobertas pela limpeza de arquivos da exclusão de conta.

## Verificação

`tests/atlas.test.ts` cobre geração, pincéis, preenchimento, histórico, seleção, curvas, redimensionamento e importação. `tests/atlas-database.test.ts` executa as migrações em PostgreSQL local e verifica privacidade, validação, versões, permissões e envio recuperável. `npm run test:atlas` exercita o fluxo no navegador com uma API local de teste, sem acessar campanhas reais. Os testes de navegador precisam de um Chromium instalado pelo Playwright ou configurado em `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Os principais atalhos aparecem no botão de teclado do editor. **V** seleciona, **B** pinta, **S** coloca símbolos, **T** coloca tokens, **R** desenha rotas, **L** coloca texto e **0** enquadra o mapa.
