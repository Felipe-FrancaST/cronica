# Magias, dados físicos e apresentação — atualização 039

Execute `supabase/migrations/202610230039_magic_and_dice_rules.sql` no SQL Editor **depois da 038**, e publique o código deste pacote. Não reaplique migrações antigas nem execute `supabase/schema.sql` em uma instalação existente; o schema completo é para instalação nova.

## Regras da campanha

Na aba **Regras**, o mestre escolhe:

- Dados dos jogadores no combate: programa ou dados físicos.
- Dados dos NPCs: seguir os jogadores, sempre virtuais ou sempre físicos.
- Animação dos dados no combate.
- Efeitos visuais leves de ataques e magias no grid.
- Mostrar ou ocultar a CD na apresentação da salvaguarda. Esta opção não é uma barreira de segurança: a CD continua fazendo parte dos dados do teste.
- Pedir concentração automaticamente após dano, ou deixar a mesa controlar esses testes fora do programa.

As solicitações já abertas mantêm o modo de dados e a apresentação definidos quando foram criadas. As novas configurações aplicam-se às próximas solicitações. A ferramenta de dados avulsos, o método de atributos e o método de PV mantêm seus controles próprios; a escolha nova cobre o fluxo de combate.

## Dados físicos

A janela pede as **faces**, sem somar bônus: um d20 pode receber `17`; uma rolagem de 2d6 pode receber `4, 6`. Em vantagem ou desvantagem, informe os dois d20. O programa escolhe o dado correto, soma os modificadores e compara com a CA ou a CD.

O servidor verifica os tipos e limites das faces, a quantidade de dados, os críticos e as repetições de dados da arma. Cada raio que acertou tem uma fórmula própria. Os registros ficam identificados como dados físicos. Os valores são declarados pelo participante; o programa não consegue verificar fisicamente o que foi rolado na mesa.

Não informe um total com bônus. Repetir uma chamada não repete dano ou consumo de recursos.

## CD e efeitos

A CD das magias de personagens é calculada pela **origem da magia**: 8 + proficiência pelo nível total + modificador do atributo de conjuração da classe correspondente. Isto também vale para multiclasse e para salvaguardas repetidas. Para NPCs, a ficha permite informar o atributo, a CD e o bônus de ataque do bloco de estatísticas. Se os números fixos estiverem vazios, o programa usa o nível e atributo configurados.

O catálogo fornecido de **361 magias e truques de 2014** recebeu uma classificação explícita. Consulte `docs/MAGIAS-2014-REVISAO.md` para ver os modos e salvaguardas. A revisão separa:

- Ataques contra CA, salvaguardas iniciais e efeitos numéricos.
- Salvaguardas adicionais que não reduzem o dano, como o envenenamento de Raio Doentio.
- Repetições no fim do turno e condições registradas por fonte, como Imobilizar Pessoa.
- Gatilhos, testes de atributo, escolhas e efeitos narrativos que precisam acompanhar a descrição.

Condições da Mesa são registradas separadamente das condições escritas manualmente na ficha. O fim de uma fonte não apaga uma condição manual ou de outra magia. As condições ativas aparecem no grid e na ficha aberta pelo seu painel; efeitos como paralisia e impedimento são considerados pelo servidor. O mestre pode encerrar uma condição quando a descrição determinar. Levantar-se de uma queda registrada gasta metade do deslocamento durante o combate. Constrição oferece o botão de tentar escapar: no próprio turno, o participante usa uma ação e faz um teste de Força contra a CD original da magia.

Entre as correções estão salvaguardas de controle ausentes, área de Constrição e Fogo das Fadas, alvos adicionais ao aumentar o círculo, PV temporários de Vitalidade Ilusória e Armadura de Agathys, dano inicial de Onda Trovejante, metade do dano inicial de Flecha Ácida no erro e consequências de truques como Toque Macabro, Toque Chocante e Zombaria Malévola.

**Limites explícitos:** a revisão não transforma todas as descrições em automações completas. Elegibilidade de alvos, imunidades a condições não cadastradas, comandos, invocações, múltiplas áreas especiais, investigação de ilusões e vários gatilhos recorrentes ainda exigem interpretação/aplicação do mestre. O dano posterior de Flecha Ácida e alterações específicas de atributos como Mente Débil ficam indicados para acompanhamento; a salvaguarda adicional de Mente Débil não reduz o dano inicial. A seleção de Cegueira/Surdez é feita antes de executar a magia. Não há aprovação do mestre no fluxo comum dos ataques ou salvaguardas dos jogadores.

## Animação e desempenho

Acerto e dano usam a animação de dados existente na própria janela de resultado. O resultado e os recursos são aplicados antes da animação, e **Continuar** permanece disponível. Dados físicos recebem a identificação correspondente e uma representação estática.

Os efeitos de combate usam um único SVG curto sobre o grid existente, com até seis pontos visíveis por evento. Não há partículas, outro contexto WebGL ou um loop de renderização permanente para esses efeitos. A preferência de movimento reduzido desativa os efeitos. As respostas compactas da 038 foram mantidas, sem aguardar um recarregamento completo do terreno após cada rolagem.

Referência de regras: [D&D Basic Rules 2014 — Spellcasting](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting). O catálogo do projeto continua usando a edição de 2014.
