# Superfícies, iluminação e exclusão de sessões

## Ruas e superfícies

Peças de estrada, água, gelo, lava e piso usam texturas alinhadas às coordenadas do mapa. Trechos com a mesma aparência e elevação se unem no desenho. Cruzamentos e sobreposições mantêm uma superfície por local, evitando a cintilação provocada por faces sobrepostas. Materiais ou variantes diferentes conservam sua aparência na transição.

Cada peça continua salva separadamente. **Selecionar objeto** reconhece a peça original sob o clique; a lista de objetos também permite selecioná-la. Excluir uma peça pode revelar outra superfície que estava por baixo. As regras de movimento, área ocupada e ocultação continuam independentes da união visual.

## Dia e noite

Na barra do Grid, use **Período do grid → Dia / Noite**. Somente o dono da campanha pode mudar essa opção. Cada mapa tem seu próprio período, salvo no Supabase. Jogadores veem a iluminação escolhida. O mestre pode mudar o período durante um combate, pois essa ação altera somente a apresentação.

A noite usa luz ambiente fria e luzes locais quentes ou mágicas. Os controles, tokens e rótulos permanecem legíveis. Sessões encerradas conservam o período salvo e não permitem alterá-lo. **Reaproveitar grid** copia também a iluminação e os ajustes das peças.

## Luz dos elementos

Tochas e lanternas, fogueiras, forjas, fogo, lava, vulcões, portais e cristais emitem luz automaticamente. Elementos invisíveis ou fontes em células ocultas não propagam luz para os participantes. A luz não remove a ocultação nem substitui as regras de visão ou movimento.

No editor do cenário:

- **Automática para este elemento** usa o comportamento padrão.
- **Emitir luz** habilita a emissão em qualquer peça, inclusive construções.
- **Sem emissão de luz** desliga a iluminação local e a emissão visual do material em 3D.
- **Alcance da luz (metros)** aceita de 1 a 60 metros; vazio recupera o padrão do elemento. O alcance respeita a escala métrica ou imperial do mapa.

Clique em **Aplicar alterações** para salvar uma peça selecionada. Peças novas usam os ajustes atuais do pincel. A luz modifica a aparência, sem conceder bônus ou recursos de combate.

No 3D, todas as fontes contribuem para o brilho do chão; um conjunto limitado de luzes ilumina os modelos próximos à câmera. O modo **3D leve** reduz esse conjunto. As luzes locais não geram passes de sombra individuais. Texturas e campos de iluminação são reconstruídos apenas quando o mapa, cenário, escala, ocultação ou período mudam.

## Obelisco

O catálogo oferece o obelisco de 2 × 2 células e altura automática de 5 m. As antigas estátuas são desenhadas como obeliscos; seus dados são preservados. Nomes personalizados, cores, estilos e dimensões continuam editáveis.

## Excluir um capítulo

Abra **Sessões**, selecione o capítulo e clique em **Excluir sessão**. O botão aparece somente para o mestre. Sessões ativas informam que precisam ser encerradas primeiro.

A confirmação identifica o capítulo e informa que a exclusão é definitiva. Ela remove a sessão, seus grids, mural, combates e registros vinculados. Fichas de personagens, NPCs e locais continuam na campanha, assim como mapas que foram copiados para outros capítulos. Arquivos de imagem compartilhados não são removidos do Storage, pois outras sessões podem utilizá-los.

A operação é uma transação no banco e verifica a autoria da campanha, o estado da sessão e a versão exibida na confirmação. Se a sessão mudou em outra aba, atualize a lista antes de excluir. Falhas de validação não deixam exclusões parciais.

## Banco e implantação

Aplique `supabase/migrations/202610070021_grid_lighting_and_session_deletion.sql` depois da 020. Ela adiciona `battle_maps.lighting`, valida os metadados de luz e disponibiliza duas operações restritas ao mestre: `set_battle_map_lighting` e `delete_campaign_session`. A cópia de grids também passa a preservar o período. Nenhuma sessão é excluída pela aplicação da migração.

Os SQLs anteriores, as configurações Supabase/Vercel e o lockfile permanecem no pacote. Para atualizar um banco já na 020, execute somente a 021.
