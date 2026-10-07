# Magias, combate e itens — v17

Esta atualização continua usando D&D 5e de 2014 / SRD 5.1 e o catálogo de magias do PDF já fornecido. Não mistura as regras de 2024. Consulte [fontes e atribuição](fontes-dnd-v16.md).

## Atualização do banco existente

Execute somente `supabase/migrations/202610070018_spell_access_combat_and_items.sql`, no mesmo projeto Supabase que já recebeu a criação/multiclasse da v16. O SQL avulso e a cópia no ZIP são iguais. Não execute as duas cópias nem reaplique as migrações antigas. O passo a passo está em [LEIA-ME-ATUALIZACAO.md](../LEIA-ME-ATUALIZACAO.md).

A migração é transacional, aceita repetição e preserva registros existentes. Não exclui tabelas de fichas, campanhas, sessões ou cenários. Se a base de multiclasse estiver ausente, informa esse pré-requisito antes de aplicar a atualização.

## Magias por classe e caminho

O seletor de classe do grimório mostra apenas origens que têm conjuração naquele nível. Bárbaro, monge e caminhos sem conjuração de guerreiro/ladino não liberam a lista de magias. Paladino e patrulheiro começam no nível 2; Cavaleiro Arcano e Trapaceiro Arcano, no nível 3. As escolhas de magias desses dois caminhos usam a lista de mago; suas restrições de escola e outras exceções específicas continuam sob conferência do mestre.

Uma multiclasse calcula os espaços compartilhados separadamente do aprendizado. Ter espaços de círculo maior não permite aprender magias desse círculo numa classe que ainda não alcançou esse nível. Cada origem tem atributo, truques e limites próprios. Bruxo conserva Pacto e Arcanos Místicos separados. A mesma magia pode ser aprendida por duas classes, sem duplicar a escolha dentro da mesma origem.

A marcação antiga de “extra” não libera qualquer magia nem transforma classes sem conjuração em conjuradoras. Magias concedidas pelo caminho, Segredos Mágicos e Pacto do Tomo têm origem e limites verificados. As opções expandidas do Ínfero entram na lista do bruxo, mas não se tornam todas conhecidas automaticamente.

Magias antigas incompatíveis são mantidas na ficha e ficam indisponíveis para conjuração. O site mostra o motivo; uma redução de nível ou mudança de caminho não apaga a descrição da magia. Escolhas conhecidas e truques são limitados no catálogo e no salvamento pelo servidor. Para substituir uma magia conhecida, remova a escolha anterior; desmarcar sua conjuração não cria uma escolha adicional. Para classes que preparam magias, o grimório mostra a quantidade preparada e seu limite, com aviso de excesso.

## Visualizar a área antes de enviar

1. Na Mesa, selecione seu personagem e abra **Conjurar magia**.
2. Escolha a magia no seletor central e o espaço que será usado.
3. Toque em **Visualizar área**. A área aparece no Grid com preenchimento, borda destacada e indicação de validade; dano usa laranja, cura usa verde e outros efeitos têm destaque próprio.
4. Aponte o centro ou a direção. Clique na célula para confirmar a posição; no celular, use os controles/taps do Grid. Confira os alvos e toque em **Enviar ao mestre**.
5. O jogador vê **Aguardando o mestre**. O mestre decide sucesso/falha e confere salvaguardas, imunidades, resistências e exceções. Se houver dados, o sucesso libera a rolagem do jogador com a fórmula calculada; dano/cura e recursos são aplicados uma única vez.

A prévia funciona em 3D e 2D, com esfera, cone, linha, cubo, alvo único e efeitos centrados no conjurador. Mira de magia não movimenta a peça. Ao mudar o espaço, o tamanho/fórmula acompanham o perfil da magia. As áreas ocultas mantêm a privacidade: a prévia do jogador não revela identidades de peças escondidas. A decisão de cobertura, linha de visão e condições específicas da descrição pertence ao mestre.

## Aplicação das habilidades na Mesa

O botão **Habilidades** abre as opções disponíveis para aquela ficha. A confirmação do mestre controla o gasto dos recursos, respeitando as regras da campanha para tentativas que falham. Movimento, ação, ação bônus, reação e ataques restantes têm reservas próprias. Retentar um envio ou uma rolagem já resolvida não reaplica o efeito.

| Classe | Aplicação integrada | Conferência ou aplicação do mestre |
| --- | --- | --- |
| Bárbaro | Fúria, bônus de dano com Força, resistência física, duração/atividade; bloqueio de conjuração e encerramento da concentração; crítico brutal quando confirmado. | Vantagem, ataques especiais e habilidades condicionais do caminho. |
| Bardo | Limites de magias/Segredos; valores de perícia; pedido de Inspiração com ação bônus e gasto do recurso. | Resultado e aplicação do dado de Inspiração, Palavras de Corte e condições da habilidade. |
| Clérigo | Domínio da Vida: bônus de cura, autocura do Curandeiro Abençoado e dados máximos de Cura Suprema. Canalizar Divindade registra gasto. | Modalidade, alvos e efeitos de Canalizar Divindade. |
| Druida | Lista/círculos, espaços, magias da Terra e reserva de Forma Selvagem. | Forma, ficha transformada e efeitos de Forma Selvagem. |
| Guerreiro | Retomar o Fôlego por nível de guerreiro; Surto de Ação; Ataque Extra; estilos de luta; limiar de crítico do Campeão. | Acerto e confirmação do crítico; Indomável e condições que exigem salvaguardas. |
| Monge | Ki em Passo do Vento/Defesa Paciente; Artes Marciais, deslocamento, Integridade Corporal, Evasão e imunidade a veneno por nível. | Esquiva/condições, saltos, Rajada de Golpes, Ataque Atordoante e reações especiais. |
| Paladino | Reserva de Imposição das Mãos, Destruição Divina com espaços comuns/Pacto, dano radiante adicional; Aura nas próprias salvaguardas. | Tipo de alvo, cura de doença/veneno com a reserva, alcance e bônus da Aura sobre aliados. |
| Patrulheiro | Lista/círculos e Matador de Colossos selecionável contra alvo ferido, uma vez no turno. | Outras escolhas do Caçador e efeitos condicionais. |
| Ladino | Ação Ardilosa, Ataque Furtivo por nível de ladino, limitação por turno e Evasão conforme salvaguarda informada. | Vantagem/aliado adjacente, ausência de desvantagem e reações como Esquiva Sobrenatural. |
| Feiticeiro | Conjuração, efeitos da Linhagem Dracônica e gasto explícito de pontos. | Metamagia, conversão de pontos/espaços e suas exceções. |
| Bruxo | Pacto, Arcanos Místicos, Tomo, opções do Ínfero e Carisma de Rajada Agonizante por raio. | Alvos/acertos de cada raio e outras invocações/efeitos especiais. |
| Mago | Origem/atributo, círculos e bônus de Evocação aplicáveis aos perfis de magia. | Esculpir Magias, ajustes de alvos e efeitos condicionais da escola. |
| Artífice | Distribuição de níveis, origem de conjuração e espaços conforme o suporte já existente. | Infusões, especialidades e habilidades de suplementos. |

As descrições do **Compêndio → Habilidades e caminhos** indicam essa aplicação. Recursos sem efeito automático registram o pedido e o gasto, com o restante aplicado pelo mestre. Rajada Mística representa um raio na fórmula base; o mestre ajusta os raios que acertaram. Vantagem, concentração, reações condicionais, transformação e toda a combinação de talentos/subclasses não são um motor automático completo de D&D.

## Inventário por tipo e itens funcionais

O catálogo tem **89 itens**, incluindo **37 armas**, **13 armaduras/escudos**, munições, quatro poções de cura, consumíveis, ferramentas, focos e equipamentos de aventura. A ficha organiza também recipientes, tesouros, itens mágicos e itens personalizados. O peso total usa quantidade e peso unitário; preço, raridade, sintonia e notas ficam disponíveis para registro.

| Tipo ou propriedade | Comportamento |
| --- | --- |
| Armas | Tipo simples/marcial, corpo a corpo/distância, alcance, dano e propriedades. O ataque usa atributo e proficiência permitida pela classe de origem e pelos treinamentos ganhos na multiclasse. |
| Proficiência adicional | O campo da arma permite informar treino de raça, talento ou outra origem, ou retirar a proficiência. O bônus adicional de ataque pode registrar uma arma mágica e não aumenta o dano por si só. |
| Versátil | A opção de duas mãos usa o dado alternativo; um escudo equipado impede essa opção. |
| Duas armas | Segunda arma usa a ação bônus depois de ataque elegível, com duas armas leves de corpo a corpo equipadas como entradas separadas. O modificador de dano segue o estilo de combate. |
| Rede | Exige alvo e uma ação inteira de Ataque; não causa dano nem abre dados de dano. O mestre aplica contenção, tamanho e condições do item. |
| Armaduras/escudos | Equipar ajusta a CA; trocar a armadura corporal/escudo evita empilhar exemplares do mesmo tipo. Proficiência de armadura, requisitos de Força e outras penalidades continuam sob conferência do mestre. |
| Munição | Disparos aprovados exigem munição compatível e consomem uma unidade; recuperação de munição e restrições de recarga são conferidas pelo mestre. |
| Poções de cura | Usadas numa ação para beber/administrar. A rolagem usa só a fórmula da poção, sem atributo de conjuração. Quantidade e PV atualizam no servidor. |
| Ácido/água benta | Pedido de ataque/uso com dano próprio e consumo do frasco. O mestre verifica acerto e tipos de criatura válidos. |
| Kit de primeiros socorros | Consome um dos dez usos e estabiliza uma criatura viva com 0 PV; não inventa cura. Kits adicionais permanecem na quantidade e fornecem os próximos usos. |
| Antitoxina | Consumo e anotação da proteção por uma hora; duração e salvaguardas são controladas pelo mestre. |
| Ferramentas, focos e demais itens | Usam propriedades, descrição e registro na ficha; só efeitos de uso definidos abrem o fluxo automático de combate. |

Itens esgotados ficam com quantidade zero, indisponíveis para uso e editáveis na ficha. Não bloqueiam o salvamento nem fornecem CA quando não existem exemplares. Itens antigos reconhecidos pelo nome são organizados sem zerar quantidades, notas ou ajustes. Itens mágicos personalizados não ganham efeitos inventados: informe os ajustes aplicáveis e use a descrição com o mestre.

## Fluidez, segurança e entrega

A mira atualiza ao mudar de célula, e a borda da área é formada pelo perímetro, sem desenhar todas as arestas internas. A contagem de recursos evita recalcular a normalização de todas as magias para cada opção. Foram mantidos o cache de terreno, a animação de dados e a proteção contra cliques/respostas repetidos.

O servidor valida dono/controlador, turno, campanha, itens, classe, recursos e alvos. A privacidade de áreas ocultas e o arquivo de sessões continuam cobertos pelos testes. O modo visual não substitui autorização.

O ZIP contém o código completo e apenas o SQL 018 para execução. Migrações/modelos anteriores estão em `supabase/development-sources.json` para reproduzir os testes locais, e não são executados pela aplicação. Veja [a validação desta entrega](validacao-v17.md) e o manifesto `arquivos-alterados-v17.json`.
