# Moedas e interações do cenário — atualização 028

## Instalação

Se o banco já está na **027**, execute `supabase/migrations/202610140028_scenery_rewards_and_mechanisms.sql` no SQL Editor do Supabase. Depois atualize o código e recarregue as abas dos participantes. Para bancos anteriores, aplique somente as migrações ausentes, em ordem, até a 028; veja [as instruções de atualização](LEIA-ME-ATUALIZACAO.md).

A migração preserva os elementos, as chaves, os itens e as coletas existentes. Pode ser reaplicada. O export `supabase/schema.sql` inclui a atualização para uma instalação nova.

## Preparar uma recompensa

1. No Grid, abra **Cenário → Interações** e procure o elemento pelo nome, tipo ou posição.
2. Clique em **Recompensas e interações**. Ao colocar uma pilha de tesouro, um baú ou uma passagem nova, a configuração já abre automaticamente.
3. Escolha um item opcional do catálogo da campanha e sua quantidade.
4. Informe as moedas. É possível combinar **cobre (PC), prata (PP), electro (PE), ouro (PO) e platina (PL)**. Cada campo aceita de zero a 1.000.000 de peças inteiras.
5. Escreva uma pista opcional e salve. Nos baús, caixotes e sarcófagos, a fechadura e a chave continuam disponíveis.

O jogador aproxima o personagem, usa **Interagir** e abre ou examina o elemento. A recompensa aparece com a lista de moedas e o item. **Recolher moedas**, **Pegar item** ou **Recolher item e moedas** entrega o conjunto à ficha de quem recolheu. As moedas são somadas à denominação correspondente, sem conversão; o item entra no inventário com suas funções e versão.

A recompensa é única para o grupo. Depois da coleta, o elemento mostra que o conteúdo já foi recolhido. Para abastecê-lo novamente, o mestre deve abrir a configuração e marcar **Repor o conteúdo já recolhido**. Alterar o valor ou a descrição, sem marcar a reposição, mantém a coleta anterior.

## Mais elementos interativos

| Elementos                                                                     | Interação disponível                                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pilha de tesouro                                                              | Examinar e recolher moedas e/ou um item.                                            |
| Baú, caixote e sarcófago                                                      | Abrir, revelar pista e recompensa, recolher e fechar; chave opcional.               |
| Barril, carroça e mesa                                                        | Procurar provisões, itens e moedas preparados pelo mestre.                          |
| Estante e suporte de armas                                                    | Investigar e recolher um item, como um pergaminho ou uma arma.                      |
| Flores, arbustos e plantação                                                  | **Procurar recursos**, com um item do catálogo e/ou moedas como recompensa.         |
| Altar                                                                         | Examinar inscrições, pistas e oferendas preparadas pelo mestre.                     |
| Placa, lápide, cruz e obelisco                                                | Ler ou examinar uma descrição ou pista escrita pelo mestre.                         |
| Poço e fonte                                                                  | Examinar uma descrição, aviso ou pista.                                             |
| Tochas, fogueiras, forjas, postes, candelabros, lareiras e cristais luminosos | Acender e apagar ao alcance do personagem; a iluminação do mapa acompanha o estado. |
| Alavanca, placa de pressão e gongo                                            | Acionar e repor o mecanismo, com mensagem opcional e ligação a uma passagem ou luz. |

As plantas e móveis são colocados normalmente. Configure suas interações depois, pela ferramenta **Interações**, para manter a decoração rápida. A oficina de Itens continua sendo o lugar para criar as regras do item que será encontrado. Por exemplo: coloque a chave de uma porta em um barril, uma poção numa estante ou ervas num arbusto, usando esses itens como recompensas.

## Pistas e permissões

O campo **Texto ao interagir** aceita até 4.000 caracteres e preserva as quebras de linha. Use-o para inscrições, pistas, descrições e respostas de mecanismos. O texto fica na configuração privada do mestre e é revelado ao abrir ou examinar o elemento; mecanismos e luzes também o revelam quando usados. A descoberta fica disponível no elemento para os participantes que podem vê-lo.

Desmarque **Permitir interação dos jogadores** para reservar as ações ao mestre. O jogador recebe a mensagem **Este elemento é controlado pelo mestre**. O mestre continua podendo usar as ações diretas do painel, inclusive durante o combate.

## Ligar mecanismos a passagens e luzes

Na configuração de uma alavanca, placa de pressão ou gongo, selecione **Controlar elemento**. A lista contém portas, grades, celas, passagens secretas e fontes de luz do mesmo mapa, identificadas pelo nome e posição.

- **Acionar** abre a passagem, inclusive sua fechadura, ou acende a luz.
- **Repor** fecha a passagem ou apaga a luz.
- A ação e o alvo são atualizados juntos. Se fechar a passagem bloquear um personagem, toda a ação é recusada e ambos mantêm seus estados anteriores.
- Uma ligação não aciona outro mecanismo; o alvo é uma passagem ou luz. As placas são pressionadas pela ação de interação do personagem.
- Se o alvo for excluído, a interação pede ao mestre para configurar outra ligação. O mecanismo mantém seu estado até essa configuração.
- Ao copiar um mapa, recompensas e pistas acompanham os elementos, inclusive o estado já recolhido. Configure novamente as ligações dos mecanismos no mapa novo, para escolher seus novos alvos.

## Consistência e resposta na mesa

A entrega do item, o crédito das moedas e o registro da coleta acontecem na mesma transação. Repetir um pedido não duplica a recompensa, inclusive depois de uma reposição. O banco verifica proximidade, controle do personagem, estado da ficha, turno, versão do elemento e sessão da aventura. O conteúdo de um recipiente fechado continua oculto; uma chave só funciona se o personagem realmente possuir o item correto no inventário.

As ações usam os objetos retornados pelo servidor para atualizar o mapa. Um mecanismo devolve também seu alvo visível na mesma resposta. A coleta atualiza a ficha em segundo plano, sem manter o diálogo bloqueado durante uma recarga completa da mesa. O menu compacto, a busca e a paginação do mestre continuam disponíveis.

## Verificação

```bash
npm ci
npm run typecheck
npm test
npm run format:check
npm run build
npm run test:rewards
npm run test:scenery
npm run test:master-panel
npm run test:performance
```

Os testes de navegador usam um servidor de campanha local, sem acessar campanhas reais. Os testes SQL executam as migrações em PostgreSQL local via PGlite.

Esta entrega passou em **310 testes de unidade e banco**, **20 fluxos de navegador** (incluindo desktop e celular), checagem de tipos, formatação e build de produção. As migrações 001 a 027 foram preservadas; a ampliação do banco está na 028.
