# VTT v10 — mesa, desempenho e dados

A mesa mantém as regras, o catálogo e os combates da v9. Esta atualização reorganiza os controles, permite editar o NPC selecionado e integra dados registrados pelo servidor ao dano e à cura.

## Atualizar a instalação que já recebeu a 009

1. Extraia `cronicarpg-vtt-dados-e-desempenho-v10.zip` em uma pasta nova. Abra a pasta `cronicarpg-vtt-v10`, onde está o `package.json`, e mantenha seu `.env.local` e as variáveis da hospedagem.
2. No SQL Editor do seu projeto Supabase, execute **somente** o arquivo inteiro `supabase/migrations/202610050010_battle_dice.sql`, uma vez. A transação instala o histórico de dados e adapta as funções de aprovação, efeitos e NPCs.
3. Execute `npm ci` e `npm run build`. Use `npm run dev` para conferir localmente ou publique o código atualizado pelo seu procedimento atual.
4. Recarregue a mesa do mestre e dos jogadores.

Não reexecute `schema.sql` em seu banco atual. Ele reúne as dez migrações e serve para uma instalação nova. As migrações 001–009 foram preservadas. Se o banco ainda estiver na 008, aplique a 009 antes da 010. Pela CLI, `npx supabase db push` aplica as pendentes quando o histórico já está alinhado.

Se a mesa pedir a migração 010, confira o resultado da consulta e se suas variáveis apontam para o projeto atualizado. A migração notifica a API para recarregar o esquema. Aplicá-la novamente não é uma correção para erros de conexão.

## Onde ficam os controles

| Local    | Jogador                                                              | Mestre                                                                                      |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Esquerda | Iniciativa, ficha própria, PV/CA, deslocamento, ações e fim do turno | Iniciativa, próximo turno e ficha/ações da peça selecionada                                 |
| Centro   | Mapa 3D/2D, câmera, movimento, alvo e área de magia                  | Os mesmos controles, configuração do mapa e peças                                           |
| Direita  | Abas Dados e Turno                                                   | Combate: decisões e efeitos; Cenário: terreno, tokens e regras; Dados: rolagens e histórico |
| Celular  | Atalhos Mapa, Ficha/ações e Dados                                    | Os mesmos atalhos e Mestre para chegar às decisões                                          |

No computador, as laterais têm rolagem independente. Trocar a aba do mestre preserva os ajustes da tentativa e o dado já rolado. No celular, o mapa aparece primeiro; os atalhos levam diretamente aos controles, sem exigir procurar em toda a página.

## Editar um NPC pela mesa

Clique no NPC no grid ou na iniciativa. Na lateral esquerda, use **Editar ficha do NPC**. A ficha abre em **Atributos e combate**, com PV atuais, máximos, temporários, atributos, CA e resistências. As outras abas permitem editar identidade, relação, ataques, magias, história e inventário.

**Salvar NPC** atualiza a ficha e o nome/retrato dos tokens. A relação Aliada/Hostil/Neutra atualiza a facção. A edição permanece exclusiva do mestre. Se o NPC receber dano ou for alterado enquanto a ficha estiver aberta, o servidor rejeita a versão antiga; feche e reabra para editar os valores atuais.

## Rolar dados

Abra **Dados**. Escolha d4, d6, d8, d10, d12, d20 ou d100, quantidade e modificador. Também pode digitar fórmulas como `2d6+3`, `d20-1` ou `1d8+1d4+3`. As fórmulas aceitam soma e subtração, com até 100 dados. No d20 único, escolha Normal, Vantagem ou Desvantagem; o histórico registra ambos os valores e qual foi mantido.

O motivo identifica ataques, salvaguardas, dano, cura ou testes. **Toda a mesa** compartilha o resultado; **Somente eu** mantém a rolagem pessoal privada; o mestre também dispõe de **Somente o mestre**. Uma rolagem pessoal de um jogador permanece privada até para o mestre. A visibilidade é aplicada no banco.

O histórico mostra fórmula, valores individuais, modificadores, participante e total. Repetir uma requisição após falha de rede recupera o mesmo registro. Clientes não podem criar ou alterar resultados diretamente. Rolagens livres muito rápidas são limitadas a cinco por segundo por usuário.

## Dano, cura e efeitos

Na tentativa recebida, o mestre pode usar **Rolar dano** ou **Rolar cura** antes de decidir. O total aparece junto à fórmula. Nesse momento, PV, ação e espaços permanecem intactos.

**Sucesso** utiliza exatamente o registro selecionado e aplica salvaguardas, multiplicadores, imunidades e ajustes por alvo conforme a v9. O registro é consumido uma vez; não há nova rolagem na aprovação. Sem prévia, a aprovação rola e registra a fórmula automaticamente. Ainda é possível informar um valor fixo. **Falha** mantém a política de recursos da mesa e não aplica dano/cura.

Em **Efeitos ativos**, o mestre também pode rolar para cada gatilho e aplicar o resultado às criaturas escolhidas. Uma rolagem de um gatilho anterior não pode ser reutilizada no próximo. Essas rolagens ficam privadas para o mestre durante a decisão; o resultado aplicado aparece no registro da ação.

Ataque/acerto, salvaguardas, condições, cobertura e as exceções das magias continuam sob decisão do mestre, conforme o guia da v9. Rolar um teste livre não modifica PV nem determina Sucesso/Falha automaticamente.

## Animação e desempenho

Os dados têm formas 3D projetadas em Canvas, com giro, quique, sombras e resultado final. O d100 usa um par de dados de dez faces: dezenas e unidades; `00` com `0` representa 100. O resultado já foi definido pelo servidor: a animação apenas o apresenta.

A animação dura cerca de 1,25 segundo, carrega sob demanda e encerra seus quadros ao terminar. Mostra até 12 peças visuais; o histórico mantém todos os dados, mesmo nas rolagens grandes. **Animar os dados** permite desligar o movimento e salva a preferência; a configuração de movimento reduzido do navegador também é respeitada. Os dados não abrem outro contexto WebGL.

Atualizações de tokens e turnos reaproveitam terreno e objetos quando o mapa não mudou. Pintura e eventos de cenário invalidam esses dados; uma conferência periódica de 30 segundos cobre a ausência de Realtime. Linhas e arrays inalterados conservam sua identidade, evitando reconstruções da cena. Os índices de bloqueios, ocupação e custo do movimento são preparados por revisão da mesa e reutilizados nas prévias. O Canvas 2D e a animação limitam a densidade de pixels para reduzir o custo em telas de alta resolução.

O microbenchmark reproduzível está em `scripts/benchmark-vtt.ts`: `node --import tsx scripts/benchmark-vtt.ts`. Ele mede apenas CPU nas prévias de caminho, não FPS ou desempenho de uma mesa real. As imagens de conferência estão nesta pasta.

## Verificação

Passaram **83 testes de regras/SQL, 21 fluxos da mesa e 8 fluxos gerais do navegador**: 112 no total, além da tipagem e do build de produção. A conferência visual incluiu computador e celular; os testes também cobrem aprovação bloqueada enquanto a rolagem ainda está chegando e timestamps distintos na identidade/estatísticas do NPC.

`npm run typecheck`, `npm test`, `npm run test:vtt` e `npm run build` conferem tipagem, regras/SQL, interface e produção. Os testes de banco usam PostgreSQL local via PGlite; os testes da mesa usam uma API local isolada. Não acessam nem modificam seu Supabase.

Após atualizar, confira com as duas contas da mesa: jogador envia uma ação, mestre rola e aprova, ambos veem os PV/recursos; selecione um NPC e salve uma alteração; role um dado público e outro privado. Isso verifica também a configuração real de Auth, RLS e Realtime do seu projeto.
