> Histórico da versão v11. Para instalar a versão atual, siga [o guia v12](vtt-edicao-nevoa-portais-e-migracao.md).

# VTT v11 — escolha central, rolagem do jogador e cenário decorável

## Atualizar o projeto que já funciona

1. Extraia `cronicarpg-vtt-fluxo-jogador-e-cenario-v11.zip` em uma pasta nova. Entre na pasta `cronicarpg-vtt-v11`, onde está `package.json`.
2. Copie o seu `.env.local` atual para essa pasta. Ele não faz parte do ZIP.
3. Se o seu Supabase já recebeu a migração **010** da versão anterior, abra o SQL Editor e execute **somente** `supabase/migrations/202610050011_player_rolls_and_scenery.sql`, uma vez. Não reexecute `schema.sql` em um banco instalado.
4. Se o banco está na 009, execute primeiro `202610050010_battle_dice.sql`, depois a 011. Se está na 008, execute a 009, a 010 e a 011, nessa ordem. As migrações 001–010 foram preservadas.
5. No terminal dessa nova pasta, execute `npm ci` e `npm run dev`. Abra a mesma campanha e mesa usando mestre e jogador.
6. Para a hospedagem, publique essa pasta atualizada pelo processo que você já usa. O build de produção é `npm run build`.

Pela CLI do Supabase, `npx supabase db push` aplica as migrações pendentes quando o histórico local corresponde ao do projeto. Para uma instalação vazia, `supabase/schema.sql` contém as onze migrações em ordem; use esse arquivo **ou** a CLI.

## Fluxo do jogador

**Executar ações → Atacar com arma / Conjurar magia** abre a escolha no centro da tela. A lista tem busca para magias, indicação de círculo, tempo de conjuração e disponibilidade de espaços. As armas vêm do inventário e as magias da ficha.

Escolher uma opção fecha a lista e mostra o efeito selecionado junto ao personagem. Escolha o espaço de magia e toque no alvo ou na área do grid. **Enviar ao mestre** fecha a seleção e mostra **Aguardando o mestre**. Uma falha de rede mantém a tentativa disponível para repetir com o mesmo identificador.

O mestre decide **Sucesso** ou **Falha**. Para efeitos personalizados ou marcados para revisão, ele pode ajustar a fórmula antes de autorizar; ela é validada e fixada para o jogador. Para dano, cura ou PV temporários com dados e aplicação imediata, o sucesso abre uma janela central com **Rolar dados** e a fórmula autorizada. O jogador não precisa selecionar dados ou digitar modificadores: a fórmula inclui a progressão do truque, o espaço usado e o modificador aplicável da ficha.

Ao rolar, o servidor registra os dados e aplica o efeito atomicamente. A animação apresenta esse registro; o total aparece quando ela termina. O resultado mostra **Você deu X de dano**, **Você curou X PV** ou PV temporários, além dos valores aplicados em cada alvo. Cura mostra a recuperação efetiva, limitada ao máximo de PV; dano em área mostra o valor da rolagem e o valor de cada alvo após salvaguardas e multiplicadores.

A fórmula segue os perfis de D&D da versão anterior. Armas usam Força/Destreza conforme suas propriedades. Magias como Curar Ferimentos incluem o atributo de conjuração. O atributo não é somado indiscriminadamente ao dano de toda magia: ele entra quando a descrição/regra correspondente prevê esse bônus. Rolagens livres continuam disponíveis na aba Dados para ataques, testes e salvaguardas.

## Recursos, aprovação e reconexão

- Sucesso reserva a ação/ação bônus e o espaço uma vez, antes da rolagem; os PV aguardam o jogador.
- Repetir a aprovação, clicar duas vezes ou reenviar uma rolagem retorna o mesmo resultado, sem novo dano, cura ou gasto.
- Uma aprovação esperando dados continua disponível ao recarregar a mesa. Ela impede mover, declarar outra ação ou terminar o próprio turno até a conclusão.
- O mestre pode cancelar a ação aprovada ou avançar o turno. O dano não é aplicado; recursos já gastos permanecem gastos.
- Falha não aplica o efeito. O consumo de ação/espaço continua seguindo a opção **Falhas consomem ação e espaço**, já existente na mesa.
- Efeitos persistentes com dano inicial só disponibilizam seus próximos gatilhos depois da rolagem inicial. Magias cujo dano acontece apenas em um gatilho permanecem no painel de efeitos do mestre.
- Ataques de oportunidade mantêm a decisão e a rolagem do mestre para resolver a reação antes de concluir o movimento interrompido.

O servidor verifica campanha, controle do personagem, jogador solicitante, turno, condição do ator e autorização. O cliente não envia um total ou uma fórmula para a rolagem aprovada. Opções privadas do mestre e alvos ocultos não são expostos na autorização que o jogador recebe.

## Decorar o cenário

Na aba **Cenário**, o mestre dispõe de **Árvore, Pinheiro, Rochas, Montanha, Ruínas, Água, Fogo e Lava**. Selecione uma peça e toque no grid para colocá-la. A prévia mostra sua área; cada clique coloca uma peça.

Defina largura e altura de **1 a 8 células**, rotação visual, bloqueio de deslocamento e custo de movimento de **1 a 10**. A rotação altera o modelo; o retângulo de células permanece a referência para colisões. Árvores, rochas, montanhas e ruínas bloqueiam por padrão. Água usa custo 2 por padrão; ele pode ser ajustado.

**Selecionar objeto** permite escolher uma peça no grid. A lista de objetos também permite selecionar, buscar, reposicionar por X/Y, redimensionar, girar, ocultar/mostrar aos jogadores e remover. **Aplicar alterações** salva os ajustes. **Parar de decorar** retorna ao movimento.

Objetos sólidos não podem ser colocados sobre personagens. O servidor rejeita peças fora dos limites, impede reduzir o mapa sobre um objeto e considera a área inteira dos personagens grandes ao validar caminhos. Bloqueios ocultos continuam valendo no servidor. Remover uma peça preserva o terreno pintado por baixo dela.

Água tem ondas e gradientes, lava tem veios luminosos, fogo tem chamas em volume, árvores têm troncos e copas e montanhas têm relevo e neve. A visualização 2D usa desenhos equivalentes. Fogo e lava decorativos não aplicam dano ambiental automático; o mestre decide esse dano conforme a situação. Bloqueio de visão não calcula linha de visão automaticamente.

## Desempenho e verificação

As peças 3D são agrupadas em malhas instanciadas por tipo e parte, com texturas procedurais reutilizadas por grupo. O cenário só é reconstruído quando muda. Não há novos downloads de imagens, contextos WebGL ou animação contínua do cenário. O limite é 1200 objetos por mapa. O terreno e os índices de caminho continuam sendo reutilizados nas atualizações de turno e personagem; a renderização 2D mantém uma camada estática separada.

Os testes cobrem o banco real em PostgreSQL local/PGlite, permissões, fórmulas, recursos, repetição de requisições, cura máxima, áreas, efeitos persistentes, objetos e colisões. Os testes de navegador usam uma API local isolada, sem acessar o seu Supabase.

Execute `npm test`, `npm run typecheck`, `npm run test:vtt` e `npm run test:e2e` para conferir. Para executar os testes de navegador em outro computador, instale antes o navegador com `npx playwright install chromium`.

As capturas desta versão estão em `vtt-v11-resultado-jogador.png`, `vtt-v11-seletor-mobile.png`, `vtt-v11-cenario-3d.png` e `vtt-v11-cenario-2d.png`. O manifesto `arquivos-alterados-vtt-v11.json` compara o conteúdo do ZIP com a versão v10.

Conferência desta entrega: **90 testes de regras/banco + 24 testes de VTT no navegador + 8 testes gerais no build de produção = 122 testes aprovados**. TypeScript, formatação e build de produção também aprovados. O registro está em `verificacao-vtt-v11.json`.
