# Oficina de itens da campanha — atualização 025

A seção **Itens** agora permite ao mestre criar e administrar seu próprio catálogo. Os itens entram no inventário dos personagens e suas funções aparecem em **Mesa → Executar ações → Usar item**.

## Instalar em um projeto existente

1. Atualize o código, preservando seu `.env.local`.
2. Se o banco já está na 024, execute `supabase/migrations/202610130025_campaign_items.sql` no SQL Editor do Supabase. Se faltarem migrações, siga a ordem de [LEIA-ME-ATUALIZACAO.md](LEIA-ME-ATUALIZACAO.md).
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
4. Publique pelo processo habitual e recarregue as abas dos participantes.

O arquivo `supabase/schema.sql` contém o histórico completo para um **banco novo**. Em um banco existente, aplique somente as migrações necessárias. O pacote não modifica seu banco automaticamente.

## Criar um item

Abra a campanha, entre em **Itens** e clique em **Criar item**. Há quatro abas:

| Aba                     | Possibilidades                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Identidade              | Nome, categoria, raridade, imagem, peso, preço em PO, etiquetas e descrição pública.                                    |
| Equipamento             | Configuração de arma ou armadura, dano, alcance, atributo, propriedades, bônus de ataque, versatilidade e sintonização. |
| Funções e bônus         | Até 12 funções, efeitos, dados, áreas, custos, cargas, recarga e bônus passivos.                                        |
| Visibilidade e segredos | Publicação no catálogo dos jogadores e notas exclusivas do mestre.                                                      |

Comece do zero, use um dos sete modelos ou adapte um dos 89 itens do compêndio. Os modelos incluem poção, varinha com duas funções, manto, botas, amuleto e chave de missão. O modelo é um ponto de partida: o mestre pode alterar nome, dados, custos, alcance e condições.

A rede, que não causa dano, é adaptada como equipamento com função de utilidade. O mestre confere o acerto e aplica a restrição descrita.

## Funções e recursos

Cada função tem nome e regras próprias. É possível definir **cura**, **dano**, **PV temporários** ou **efeito narrativo/utilidade**. Fórmulas aceitam dados como `2d6+3`, somas de dados e valores fixos; não executam scripts.

Escolha ação, ação bônus, reação ou uso sem ação. A Mesa executa as funções no turno do personagem e confere a disponibilidade do recurso escolhido; reações fora do turno continuam sendo conduzidas pelo mestre.

Os alvos podem ser uma criatura, o próprio usuário, esfera, cone, linha ou cubo. Nas áreas, configure origem, tamanho e largura da linha. Alcances e áreas são informados em metros e convertidos para a escala do mapa. Para dano, há tipo de dano, salvaguarda e metade ao passar; o mestre confere a CD e o resultado na aprovação.

O item tem uma reserva de cargas, e cada função define seu próprio **custo em cargas** e **unidades consumidas**. Custo zero significa que aquele recurso não é consumido. Uma função pode exigir que o item esteja equipado; a sintonização, quando exigida pelo item, também precisa estar marcada na ficha.

Exemplos:

| Item                | Função     | Configuração                                                        |
| ------------------- | ---------- | ------------------------------------------------------------------- |
| Poção de cura       | Beber      | Cura `2d4+2`, uma ação, consome 1 unidade.                          |
| Varinha de 7 cargas | Raio       | Dano `2d6`, alcance 18 m, gasta 1 carga.                            |
| A mesma varinha     | Cone       | Dano `3d6`, cone de 4,5 m, gasta 2 cargas.                          |
| Amuleto de 3 cargas | Vigor      | PV temporários `1d8+2`, próprio usuário, ação bônus, gasta 1 carga. |
| Chave de missão     | Abrir selo | Utilidade, texto com condições, sem consumo obrigatório.            |

Funções sem quantidade ou cargas suficientes não ficam disponíveis. Custos e regras são conferidos novamente no servidor ao solicitar e resolver a tentativa. Aprovar ou repetir uma solicitação não duplica o consumo nem a aplicação do resultado. Falhas seguem a configuração existente da campanha sobre consumir recursos.

## Bônus passivos

Há ajustes positivos ou negativos de **CA**, **ataque com armas**, **dano de armas** e **deslocamento**. O mestre decide se o bônus exige equipamento ou basta carregar o item. Itens que exigem sintonização só ativam seus bônus após sintonizar.

Os bônus entram nos cálculos da ficha e dos ataques. O deslocamento também é conferido no banco e atualizado pela preparação do turno; equipar botas não concede movimento extra retroativo em um turno já iniciado. Quantidade zero desativa o item. Um conjunto de unidades na mesma linha do inventário aplica o bônus uma vez; cópias em linhas distintas podem acumular, e o mestre deve conferir as restrições da sua mesa.

## Entregas, versões e recarga

Clique em **Entregar**, escolha um personagem da campanha e informe a quantidade. O inventário recebe uma cópia da definição atual, com versão registrada. Itens com cargas são entregues individualmente para preservar reservas separadas.

Editar o modelo afeta entregas futuras. Cópias já recebidas preservam suas funções e regras. Duplicar cria um novo modelo; arquivar retira o modelo das novas entregas e do catálogo público, preservando o inventário e o histórico. Reativar permite usá-lo novamente.

O histórico mostra as entregas, a quantidade atual e a reserva de cargas quando o personagem está disponível. **Restaurar cargas** é um controle do mestre. A condição escolhida — descanso curto, longo, amanhecer ou decisão do mestre — é uma orientação para ele confirmar o momento da recarga. O sistema não avança o tempo nem recarrega itens automaticamente ao descansar. Itens com **Não recarrega** não oferecem esse botão.

Na ficha, o jogador pode equipar, sintonizar e escrever observações. A definição das funções fica protegida. Aumentos de quantidade, ajustes de cargas e mudanças no catálogo são controles do mestre. Se outra janela modificar o modelo ou a ficha, operações sensíveis pedem uma atualização para evitar sobrescrever mudanças recentes.

## Publicação e efeitos narrativos

Publicar um modelo permite aos membros da campanha consultar suas informações públicas. Uma entrega pode acontecer mesmo com o modelo privado: o destinatário recebe as regras do item, mas as notas secretas do mestre não são copiadas para o inventário nem enviadas aos jogadores.

Use as notas secretas para maldições ocultas, pistas, origem e consequências desconhecidas. Use a descrição pública e as regras da função para o que o portador conhece. Imagens usam o armazenamento privado de mídia já existente da campanha.

Efeitos narrativos, duração, maldições, teleporte, invocação e alterações de condições são descritos e aprovados pelo mestre; não executam scripts ou mudanças arbitrárias no mundo. Cura, dano, PV temporários, custos e os quatro bônus passivos têm integração mecânica. Acerto, salvaguarda e demais exceções continuam sob decisão do mestre.

## Validação local

```bash
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:items
```

A suíte de itens usa uma aplicação e API locais isoladas. Os testes SQL aplicam as migrações em PostgreSQL local via PGlite e verificam permissões, notas secretas, versões, entregas idempotentes, consumo, bônus de deslocamento e recarga. Nenhum desses testes acessa seu Supabase real.
