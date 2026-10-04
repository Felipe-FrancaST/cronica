# VTT v9 — ações, áreas de magia e migração

Esta versão usa as regras de D&D 5e de 2014 já adotadas pela ficha. Mantém o catálogo de 361 magias do PDF, classes, raças e os contadores de conjuração existentes.

## Atualizar seu banco atual

1. Faça um backup antes da atualização pelo seu procedimento habitual.
2. Abra o projeto correto no painel do Supabase e entre em **SQL Editor → New query**.
3. No projeto extraído, abra `supabase/migrations/202610040009_battle_actions.sql`.
4. Copie o arquivo inteiro, cole na consulta e execute **uma vez**. Ele contém `begin`/`commit`: uma falha impede uma instalação parcial.
5. O banco que já recebeu a 008 precisa apenas da 009. Não execute `schema.sql` nesse banco. Se ainda estiver na 007, aplique a 008 antes da 009.
6. Se usar a CLI e seu histórico já estiver alinhado, `npx supabase db push` aplica as migrações pendentes. Não misture uma instalação manual antiga com um histórico da CLI vazio.
7. Atualize o código do site, mantendo suas variáveis de ambiente. Execute `npm ci` e `npm run build`; para conferir localmente, `npm run dev`. Na hospedagem, faça um novo deploy com os arquivos desta entrega.
8. Recarregue a página do mestre e dos jogadores.

Para um projeto Supabase novo, execute `supabase/schema.sql` uma vez ou use todas as migrações pela CLI, conforme o README.

A migração mantém personagens, campanhas, mapas e posições. Adiciona orçamento de ações aos tokens, fila de tentativas, auditoria privada de PV, efeitos persistentes, planos de movimento e metadados de combate das magias. Tokens antigos recebem facção e o deslocamento da ficha, preservando o movimento já gasto.

Se aparecer **Atualize o banco com a migração 009**, o frontend conseguiu ler o mapa, mas as tabelas novas ainda não estão disponíveis. Aplique a migração, aguarde o recarregamento da API e atualize a página. Se já foi aplicada, não a execute novamente; confira o resultado da consulta e o projeto configurado nas variáveis.

## Colocar a imagem no grid

1. Como mestre, abra a mesa e clique em **Configurar mapa**.
2. Selecione um JPG, PNG ou WebP de até 25 MB. A prévia aparece no formulário.
3. Ajuste escala e deslocamento do fundo, se necessário, e salve.

O navegador otimiza mapas grandes para até 4096 pixels no lado maior e até 5 MB, respeitando o bucket privado existente. A seleção não se perde com atualizações automáticas da mesa. Erros aparecem no próprio formulário e permitem tentar novamente. Remover o fundo também funciona. A imagem é a textura do chão em 3D e o fundo na vista 2D.

O bucket `campaign-media` continua privado. URLs assinadas e permissões de campanha protegem as imagens; não é preciso tornar o bucket público.

## Fluxo do jogador e do mestre

1. O mestre adiciona os tokens, define a iniciativa e inicia o combate.
2. A lateral do jogador mostra seu personagem, PV, deslocamento e disponibilidade de ação, bônus e reação.
3. **Abrir ficha** abre a ficha completa na mesa e permite salvar alterações.
4. **Executar ações → Mover** seleciona o personagem. Aponte para ver o caminho; clique para mover. No celular, o primeiro toque mostra a prévia e o segundo confirma. Mover não gasta a ação.
5. **Atacar com arma** lista as armas do inventário; escolha a arma e toque no alvo. Modo, atributo e alcance da arma podem ser configurados na ficha.
6. **Conjurar magia** lista truques e magias preparadas/conhecidas disponíveis. Escolha a magia e o espaço. Toque no grid para posicionar a área ou apontar o cone/linha; para alvo único, toque na criatura. Curas com escolha de criaturas permitem selecionar os alvos da área.
7. **Enviar ao mestre** cria a tentativa. PV e espaços permanecem intactos enquanto ela estiver pendente.
8. O mestre recebe o nome do jogador, a ação, a descrição e os alvos. Pode mostrar a área, conferir dados/valor, formato/dimensão, tipo de dano, salvaguardas, resistências, imunidades e valores por alvo.
9. **Sucesso** aplica a ação, atualiza PV/recursos e registra o resultado. **Falha** não aplica dano, cura ou o efeito da ação.

Por padrão, uma tentativa que falha consome a ação e o espaço utilizado, como um ataque ou uma magia que não acertou. O mestre pode desativar **Falha consome a ação e o espaço utilizado** em Regras do turno. **Cancelar sem gasto** desfaz uma tentativa antes da decisão sem consumir recursos.

Pedidos pendentes impedem o jogador de mover ou encerrar o turno. O mestre pode cancelar a tentativa ou avançar o turno, expirando-a. Repetir o envio com o mesmo identificador ou clicar duas vezes em aprovar não aplica o dano nem gasta recursos duas vezes.

## Movimento e economia de ações

- Mover consome apenas deslocamento. É possível mover antes, depois e entre ataques de Ataque Extra.
- Terreno difícil, bloqueios, diagonais, colisões, tamanho inteiro da criatura e limites do mapa são conferidos também no servidor.
- **Disparada** usa uma ação e acrescenta um deslocamento extra.
- **Desengajar** usa uma ação e impede ataques de oportunidade pelo movimento até o fim desse turno.
- Ladinos de nível 2 ou maior podem usar **Ação Ardilosa** para Disparada/Desengajar como bônus; a opção pode ser desmarcada para usar a ação normal.
- **Esquivar** mantém a marca até o próximo turno do personagem. O mestre aplica vantagem/desvantagem e demais condições pertinentes ao decidir os ataques.
- Sair do alcance corpo a corpo de um inimigo com reação disponível coloca o movimento em espera. O mestre decide a reação antes da saída; a reação gasta a reação do inimigo, sem gastar a ação de quem se move. Se reduzir o personagem a 0 PV, o caminho é cancelado.
- Alcance, visibilidade real, características que impedem reação e exceções especiais são conferidos pelo mestre. A escolha automática de ataque de oportunidade usa a primeira arma corpo a corpo disponível; recursos extraordinários de classe continuam sob adjudicação.
- A conversão de regras usa **1,5 m = 5 pés** e **9 m = 30 pés**, sem perder movimento por arredondamento científico.

## Magias, dano e cura

Todos os 361 registros têm um perfil de combate vinculado ao catálogo e à magia da ficha. Nesta versão, 83 perfis possuem áreas e 58 possuem fórmulas revisadas de dano/cura/PV temporários. Os demais efeitos podem ser configurados pelo mestre no painel de aprovação, com a descrição original à vista.

Esferas/cilindros, cones, linhas e cubos são projetados no chão do grid em 3D/2D. Criaturas grandes são atingidas se a área cruzar uma de suas células, recebendo o efeito uma vez. Não há simulação de volume vertical, cobertura ou linha de visão automática. Áreas muito grandes têm prévia visual limitada a 20 mil células; o servidor confere todos os tokens atingidos.

O cálculo inclui círculos superiores, escalonamento de truques, modificador de conjuração quando pertinente, espaços normais, pacto e Arcanos Místicos. A restrição de magia bônus da edição 2014 é validada no servidor. O mestre decide acerto, salvaguarda e resistência: salvaguarda e resistência são operações separadas, permitindo inclusive um quarto do dano.

Dano absorve PV temporários antes de reduzir PV atuais. Cura respeita o máximo; PV temporários usam o maior valor, sem acumular. Cura em Massa confere a soma de até 700 PV distribuídos; Palavra de Poder Curar restaura PV ao máximo; Toque Vampírico também cura o conjurador. Reservas de PV de Sono/Leque Cromático não são tratadas como dano.

Efeitos persistentes ficam em **Efeitos ativos**. O mestre usa **Aplicar efeito** apenas no gatilho descrito pela magia, selecionando as criaturas pertinentes. Isso não gasta outro espaço. Repetir Toque Vampírico/Raio de Sol exige a ação do conjurador no turno dele. O dano posterior da Flecha Ácida de Melf se encerra após uma aplicação. Use **Encerrar** ao terminar a duração ou perder concentração; novos efeitos de concentração encerram os anteriores, e 0 PV encerra a concentração. Terminar o combate não apaga automaticamente uma magia cuja duração continua.

O relógio de duração, testes de concentração, condições especiais, invocações, teleporte, paredes complexas, movimento de efeitos, múltiplos raios/dardos e danos de tipos diferentes exigem revisão do mestre. Ele pode ajustar os alvos e valores no pedido ou aplicar gatilhos aos poucos. Longas conjurações exigem acompanhar o tempo; a fila não transforma minutos de conjuração em uma ação instantânea. Rituais continuam disponíveis na ficha, fora do envio de ação instantânea da mesa.

## Facções

Aliados usam verde, inimigos vermelho e neutros dourado, na base do token e na iniciativa. NPCs recebem a cor pela relação cadastrada; alterar a relação atualiza os tokens existentes. O mestre também pode escolher a facção individual no painel de tokens. Seleção e turno usam um anel independente, preservando a cor da facção.

## Verificação

Nesta entrega passaram **72 testes de regras/SQL, 14 fluxos do VTT e 8 fluxos gerais do navegador** (94 no total), além de TypeScript e build de produção.

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:vtt
```

Os testes SQL executam as nove migrações em PostgreSQL via PGlite, com papéis sem bypass de RLS. Conferem autorização, recursos, cura/dano, salvaguardas, áreas, idempotência, movimento, reações, limites e revogação de acesso. Os testes VTT usam uma API local e dados isolados, cobrindo upload, ficha, seleção, envio, aprovação/falha e celular; não modificam seu Supabase.

Depois da migração, confira com duas contas da sua mesa: mestre envia imagem, jogador abre ficha/seleciona magia, mestre aprova e ambos veem o resultado. Isso valida suas configurações reais de Auth, Storage e Realtime.
