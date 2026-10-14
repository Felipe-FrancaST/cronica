# Luzes, baús e chaves — atualização 026

O Grid passa a ter **70 elementos**. A atualização melhora a iluminação local, acrescenta oito peças e conecta recipientes e fechaduras ao catálogo de itens da campanha.

## Instalar

1. Atualize o código, preservando seu `.env.local`.
2. Se o banco já está na **026**, execute `supabase/migrations/202610140027_scenery_container_timestamp_fix.sql` no SQL Editor do Supabase para corrigir as datas vazias no salvamento. Se está na **025**, aplique 026 e 027, nessa ordem. Se faltarem migrações, siga [LEIA-ME-ATUALIZACAO.md](LEIA-ME-ATUALIZACAO.md).
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
4. Publique pelo processo habitual e recarregue as abas dos participantes.

O pacote não modifica seu Supabase automaticamente. `supabase/schema.sql` é o histórico completo para um banco novo; em um projeto existente, use os arquivos individuais necessários.

## Luzes e novos elementos

Tochas, fogueiras e outras fontes têm iluminação mais concentrada perto da chama, queda suave no chão e iluminação dos modelos próximos. A oficina permite ajustar **alcance**, **intensidade de 0,2 a 3** e **cor da luz**. O mestre pode **acender e apagar durante o combate**, preservando a posição, o nome e os outros ajustes do elemento. Ao apagar, as chamas e a iluminação desaparecem; a estrutura permanece.

As luzes continuam usando um conjunto limitado de luzes 3D e reutilizando os modelos que não mudaram. O alcance segue os metros da campanha. Luzes não revelam a névoa nem elementos ocultos pelo mestre. A visão por personagem continua obedecendo às configurações existentes do mapa.

| Novo elemento          | Uso e interação                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| Poste de lanterna      | Luz para ruas e praças; acender e apagar.                          |
| Candelabro             | Iluminação de interiores; acender e apagar.                        |
| Lareira                | Fogo para salas, tavernas e acampamentos; acender e apagar.        |
| Cristal luminoso       | Luz mágica com cor ajustável; ativar e apagar.                     |
| Gongo de alarme        | Acionar ou repor o alarme; o mestre decide as consequências.       |
| Placa de pressão       | Pressionar ou repor; o mestre conduz os efeitos do mecanismo.      |
| Passagem secreta       | Abrir ou fechar, com bloqueios de movimento e visão; aceita chave. |
| Caixote de suprimentos | Abrir ou fechar; aceita recompensa e fechadura.                    |

As peças têm modelos próprios em 3D e símbolos em 2D, na categoria **Aventura**. O mestre também pode armar/desarmar armadilhas e ativar/desativar círculos rituais. Testes, dano de armadilhas, alarmes e outros efeitos narrativos continuam sob sua decisão.

## Preparar um baú

Crie a recompensa na seção **Itens**. Você pode partir de um item do compêndio ou criar suas funções, cargas e bônus na oficina.

Em **Mesa → Grid → Cenário**, habilite **Editar grid**, escolha **Baú** e clique no lugar do mapa. Antes de colocá-lo, abre-se a configuração:

- **Item dentro do recipiente:** escolha um item ativo da campanha ou deixe o recipiente vazio.
- **Quantidade:** unidades da recompensa. Itens com cargas são guardados individualmente, para preservar suas reservas.
- **Exigir chave para abrir:** desmarcado permite abrir sem chave. Marcado cria a chave automaticamente.
- **Nome da chave:** o mestre escolhe o nome. A chave aparece na seção **Itens**, inicialmente reservada ao mestre.
- **Manter trancado ao salvar:** permite preparar uma fechadura já aberta ou iniciar o elemento trancado.

Salve para criar o elemento, sua configuração e a chave juntos. O conteúdo fica separado das informações públicas do mapa: o jogador não recebe o nome nem as regras da recompensa enquanto o recipiente estiver fechado.

Para mudar um recipiente existente, selecione-o e use **Conteúdo e fechadura**. O mesmo botão fica nas interações do cenário, inclusive durante o combate. Se a recompensa já foi coletada, **Repor o conteúdo já recolhido** disponibiliza um novo lote por decisão do mestre.

Baús, caixotes e sarcófagos aceitam recompensas. Portas, grades, celas e passagens secretas aceitam fechaduras. Fechar ou trancar uma passagem sobre um personagem é recusado.

## Entregar e usar a chave

Abra **Itens**, encontre a chave criada e clique em **Entregar** para colocá-la no inventário de um personagem. Ela usa a mesma entrega segura dos outros itens da campanha.

A chave corresponde à sua fechadura pela identidade do item. Outra chave com o mesmo nome não funciona. Renomear o modelo não invalida cópias já entregues; elas preservam a versão e o nome recebidos, mas mantêm o vínculo correto. Usar a chave não a consome. A chave é aplicada pelo controle **Interagir** do cenário.

O mestre pode abrir uma fechadura diretamente, destrancá-la ou voltar a trancar nas interações do cenário. Alterar nomes ou configurações gerais continua seguindo os controles de edição do Grid.

## Interagir como jogador

Selecione seu personagem e aproxime-o do elemento. Há dois caminhos:

1. Use um dos botões em **Interagir com elementos próximos**.
2. Clique em **Selecionar elemento no Grid** e toque no objeto em 2D ou 3D. Esse modo seleciona o elemento sem mover o personagem; o botão permite voltar ao movimento.

Um baú fechado com chave mostra **“Baú trancado. Você precisa da chave correta.”** A porta mostra **“Porta trancada”**. Escolha a chave do inventário e clique em **Usar chave e abrir**. Sem fechadura, **Abrir elemento** funciona sem chave.

Depois de abrir, a recompensa aparece. **Pegar item** entrega o conteúdo ao inventário do personagem e registra a coleta no histórico de entregas. Repetir uma solicitação não duplica o item. Quando alguém já recolheu o lote, os outros jogadores veem que o conteúdo foi recolhido.

A interação exige um personagem controlado pelo jogador, no mesmo mapa e próximo da área do elemento. Durante o combate, o jogador aguarda seu turno. Personagens incapacitados ou com uma tentativa pendente precisam concluir essa situação antes de interagir. A interação direta não faz rolagens de arrombamento nem desconta uma ação de combate; o mestre conduz essas exceções conforme as regras da sua mesa.

Notas secretas dos modelos não entram na recompensa. A recompensa guarda a versão escolhida; editar o modelo depois não altera o lote preparado silenciosamente.

## Cópias e histórico

Ao copiar um mapa, a configuração acompanha o elemento, com a mesma chave e o estado atual da recompensa. Um lote já recolhido permanece recolhido; o mestre pode repô-lo na nova configuração. Excluir o elemento não remove chaves nem itens já entregues aos personagens. Sessões encerradas continuam disponíveis para consulta, sem novas interações.

## Validar

```bash
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:scenery
```

Os testes de navegador usam uma aplicação e API locais. Os testes SQL verificam privacidade, chaves corretas e incorretas, coleta idempotente, proximidade, versões, cópias, colisões de passagens, iluminação durante o combate e sessões encerradas. Nenhum desses testes acessa seu Supabase real.
