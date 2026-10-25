# Mapas no mural e marcações compartilhadas

Execute `supabase/migrations/202610250046_mural_map_annotations.sql` depois da 045 e publique o código atualizado. As migrações 001–045 foram preservadas. Em um banco existente, execute somente as migrações ausentes em ordem; não execute `schema.sql`.

Na Oficina de mapas, as seções agora se chamam **Criar token** e **Criar símbolo**, conforme a ferramenta. Os fundos do catálogo aparecem em **Terrenos**. A biblioteca continua separando os recursos do sistema e os pessoais de cada mestre.

## Enviar ao mural

Abra o mapa na oficina e use **Enviar ao mural**. O capítulo em andamento é sugerido automaticamente. Escolha o capítulo, confira o título e clique em **Publicar no mural**. O mapa é salvo e uma imagem das camadas visíveis é enviada para o mural do capítulo, disponível aos jogadores quando o capítulo estiver em andamento. Capítulos em preparação permanecem reservados ao mestre.

Os tokens de planejamento são opcionais e começam desmarcados. As notas privadas e as camadas ocultas não entram na imagem. O documento editável e a biblioteca pessoal permanecem reservados ao mestre; o mural recebe uma imagem própria da campanha. Você pode continuar editando e publicar outra imagem quando quiser. Repetir o envio após uma falha de conexão reaproveita a publicação em andamento, evitando cartões duplicados.

## Marcações dos jogadores

Em **Regras da campanha → Permissões dos jogadores**, ative **Permitir marcações nos mapas do mural**. A opção começa desativada. Jogadores podem abrir as imagens do mural para explorar e ampliar mesmo sem permissão para escrever.

Com a permissão ativa, o visualizador oferece **Desenhar**, **Marcar ponto**, **Adicionar texto** e **Borracha**, além de cor, espessura, zoom e enquadramento. Cada jogador apaga somente suas próprias marcações. O mestre pode apagar qualquer marcação ou limpar todas com confirmação. Desativar a regra mantém os desenhos anteriores visíveis e bloqueia novas alterações pelos jogadores.

Os desenhos são uma camada separada e não alteram a imagem original. As coordenadas acompanham o tamanho e o zoom de cada tela. O traço aparece imediatamente e é salvo quando o gesto termina. Clientes recebem apenas as alterações posteriores à última revisão; atualizações simultâneas não substituem os desenhos de outros jogadores. Uma sincronização periódica funciona como alternativa ao Realtime. Fechar com marcações ainda não salvas mostra um aviso.

Substituir a imagem de um cartão reinicia suas marcações para evitar coordenadas incorretas. As sessões encerradas permanecem disponíveis apenas para consulta. A exclusão do cartão remove suas marcações; a exclusão de uma conta remove as marcações de seu autor.

## Revisão de código

As consultas do mural e dos capítulos foram organizadas para reunir solicitações simultâneas, descartar respostas de sessões anteriores e preservar dados que não mudaram. As ferramentas de marcação e o diálogo de publicação carregam somente quando são abertos. A geometria dos desenhos é limitada e validada no cliente e no banco, com autorização em cada operação.

## Validação

Passaram a compilação de produção, a verificação TypeScript, a formatação dos arquivos alterados e os **586 testes automatizados** de regras, banco e serviços. Foram validados **54 cenários de navegador**, abrangendo a oficina, as bibliotecas de imagens, publicação no mural, marcações, permissões, falhas de conexão, celular, capítulos, visão dos jogadores e controles do mestre.

A revisão visual confirmou o enquadramento do mapa em computador e celular. Foram conferidos o aviso ao fechar com trabalho pendente, a publicação no capítulo em andamento mesmo quando há capítulos futuros e a recuperação de uma resposta perdida sem duplicar o cartão.

Os testes usam dados locais. Para repetir os fluxos das bibliotecas e do mural, execute `npm run test:mural-maps`. As alterações no banco de produção dependem da execução da migração 046 pelo responsável pelo projeto.
