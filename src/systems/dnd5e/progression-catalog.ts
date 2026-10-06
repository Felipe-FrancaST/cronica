import { CLASSES, SKILLS } from './catalog';
import type { Ability } from './types';

// Portuguese summaries and structured rules adapted from SRD 5.1 (CC-BY-4.0).
// Attribution and the exact sources are in docs/fontes-dnd-v16.md.
export interface ClassFeature {
  id: string;
  level: number;
  name: string;
  description: string;
}
export interface ClassPath {
  id: string;
  class_id: string;
  name: string;
  level: number;
  source: string;
  features: ClassFeature[];
}
export interface ChoiceOption {
  id: string;
  name: string;
  description: string;
  level?: number;
  pact?: string;
}
export interface FeatureChoice {
  id: string;
  name: string;
  level: number;
  count: number;
  options: ChoiceOption[];
  skills?: boolean;
  expertise?: boolean;
}
const f = (level: number, name: string, description: string): ClassFeature => ({
  id: name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-'),
  level,
  name,
  description,
});
const asi = (levels = [4, 8, 12, 16, 19]) =>
  levels.map((l) =>
    f(
      l,
      'Melhoria de atributos',
      'Distribua 2 pontos: +2 em um atributo ou +1 em dois. Limite 20; a melhoria pertence ao nível desta classe. Talentos opcionais exigem acordo com o mestre.',
    ),
  );
export const CLASS_FEATURES: Record<string, ClassFeature[]> = {
  barbarian: [
    f(
      1,
      'Fúria',
      'Ação bônus; dura até 1 minuto. Vantagem em testes e salvaguardas de Força, resistência a dano cortante, perfurante e concussão e bônus no dano de ataques corpo a corpo com Força. Sem armadura pesada; impede conjuração e concentração. Bônus +2, +3 no nível 9 e +4 no 16.',
    ),
    f(
      1,
      'Defesa sem armadura',
      'Sem armadura, CA = 10 + DES + CON; escudo permitido. Em multiclasse, outra Defesa sem Armadura não é adquirida novamente.',
    ),
    f(
      2,
      'Ataque descuidado',
      'No primeiro ataque do turno, pode dar vantagem aos ataques corpo a corpo com Força deste turno; ataques contra você têm vantagem até seu próximo turno.',
    ),
    f(
      2,
      'Sentido de perigo',
      'Vantagem em salvaguardas de Destreza contra efeitos que você vê, se não estiver cego, surdo ou incapacitado.',
    ),
    f(3, 'Caminho primitivo', 'Escolha seu caminho; novas habilidades nos níveis 6, 10 e 14.'),
    f(
      5,
      'Ataque extra',
      'Dois ataques com a ação Atacar. Não soma com Ataque Extra de outra classe.',
    ),
    f(5, 'Movimento rápido', '+3 m de deslocamento enquanto não usa armadura pesada.'),
    f(
      7,
      'Instinto selvagem',
      'Vantagem na iniciativa; pode agir surpreendido se entrar em fúria antes de agir.',
    ),
    f(
      9,
      'Crítico brutal',
      'Um dado adicional da arma em críticos corpo a corpo; dois no nível 13, três no 17.',
    ),
    f(
      11,
      'Fúria implacável',
      'Se chegar a 0 PV em fúria sem morrer, salvaguarda de CON CD 10 para ficar com 1 PV. CD sobe 5 a cada uso; reinicia em descanso curto ou longo.',
    ),
    f(
      15,
      'Fúria persistente',
      'A fúria termina antecipadamente apenas se você ficar inconsciente ou a encerrar.',
    ),
    f(
      18,
      'Força indomável',
      'Se um teste de Força ficar abaixo de seu valor de Força, use o valor do atributo.',
    ),
    f(
      20,
      'Campeão primitivo',
      'FOR e CON aumentam em 4; seus limites passam a 24. A ficha aplica esse aumento às fichas com atributos gerados.',
    ),
    ...asi(),
  ],
  bard: [
    f(
      1,
      'Conjuração',
      'Carisma; magias conhecidas, rituais conhecidos e foco musical. Cada classe mantém sua própria seleção de magias.',
    ),
    f(
      1,
      'Inspiração de bardo',
      'Ação bônus para inspirar outra criatura que ouve você em 18 m. Dado d6 em até 10 minutos para teste, ataque ou salvaguarda; d8 no nível 5, d10 no 10, d12 no 15. Usos = CAR (mínimo 1).',
    ),
    f(
      2,
      'Versatilidade',
      'Metade da proficiência, arredondada para baixo, em testes sem proficiência; inclui iniciativa.',
    ),
    f(
      2,
      'Canção de descanso',
      'Ao recuperar PV com Dados de Vida num descanso curto, aliados que ouvem você recuperam +1d6; d8 no nível 9, d10 no 13, d12 no 17.',
    ),
    f(3, 'Colégio de bardo', 'Escolha seu colégio; benefícios nos níveis 6 e 14.'),
    f(
      3,
      'Especialização',
      'Escolha duas perícias em que é proficiente para dobrar o bônus de proficiência. Mais duas no nível 10.',
    ),
    f(5, 'Fonte de inspiração', 'Inspirações passam a recuperar em descanso curto ou longo.'),
    f(
      6,
      'Contrafeitiço',
      'Ação: até o fim do próximo turno, aliados em 9 m que ouvem você têm vantagem contra medo e encantamento.',
    ),
    f(
      10,
      'Segredos mágicos',
      'Escolha duas magias de qualquer classe até seu círculo de bardo; contam no limite de conhecidas. Mais duas nos níveis 14 e 18.',
    ),
    f(20, 'Inspiração superior', 'Ao rolar iniciativa sem inspirações restantes, recupera um uso.'),
    ...asi(),
  ],
  cleric: [
    f(
      1,
      'Conjuração',
      'Sabedoria; prepara nível de clérigo + SAB magias (mínimo 1). Magias de domínio ficam sempre preparadas e não contam nesse limite. Rituais preparados.',
    ),
    f(1, 'Domínio divino', 'Escolha o domínio; habilidades nos níveis 1, 2, 6, 8 e 17.'),
    f(
      2,
      'Canalizar divindade',
      'Uma reserva compartilhada com paladino: um uso, dois no nível 6, três no 18; recupera em descanso curto ou longo. Escolha Expulsar Mortos-Vivos ou o efeito do domínio.',
    ),
    f(
      2,
      'Expulsar mortos-vivos',
      'Ação, símbolo sagrado: mortos-vivos em 9 m que veem ou ouvem você fazem salvaguarda de SAB contra sua CD de clérigo; falha os expulsa por 1 minuto ou até sofrerem dano.',
    ),
    f(
      5,
      'Destruir mortos-vivos',
      'Ao falharem contra Expulsar, mortos-vivos até ND 1/2 são destruídos; ND 1 no nível 8, 2 no 11, 3 no 14, 4 no 17.',
    ),
    f(
      10,
      'Intervenção divina',
      'Ação: role d100; resultado até seu nível de clérigo recebe intervenção escolhida pelo mestre. Falha recupera em descanso longo; sucesso aguarda 7 dias. No nível 20, sucesso automático.',
    ),
    ...asi(),
  ],
  druid: [
    f(
      1,
      'Druídico',
      'Aprende o idioma secreto Druídico; mensagens ocultas são reconhecidas por druidas.',
    ),
    f(
      1,
      'Conjuração',
      'Sabedoria; prepara nível de druida + SAB magias (mínimo 1). Rituais preparados. Druidas evitam armaduras e escudos de metal.',
    ),
    f(
      2,
      'Forma selvagem',
      'Ação: assume forma de uma besta já vista por até metade do nível de druida em horas. Dois usos por descanso curto/longo. ND 1/4 sem voo/natação; ND 1/2 com natação no nível 4; ND 1 com voo no nível 8. Regras da forma e PV separados são resolvidas com o mestre.',
    ),
    f(2, 'Círculo druídico', 'Escolha o círculo; benefícios nos níveis 6, 10 e 14.'),
    f(18, 'Corpo atemporal', 'Envelhece um ano a cada dez anos.'),
    f(
      18,
      'Magias da besta',
      'Pode usar componentes verbais e somáticos de magias de druida em Forma Selvagem, com as restrições dos componentes materiais.',
    ),
    f(
      20,
      'Arquidruida',
      'Forma Selvagem ilimitada; ignora componentes verbais, somáticos e materiais sem custo que não sejam consumidos.',
    ),
    ...asi(),
  ],
  fighter: [
    f(1, 'Estilo de luta', 'Escolha um estilo; o mesmo estilo não pode ser escolhido duas vezes.'),
    f(
      1,
      'Retomar o fôlego',
      'Ação bônus: recupera 1d10 + nível de guerreiro PV. Um uso por descanso curto ou longo.',
    ),
    f(
      2,
      'Surto de ação',
      'Uma ação adicional neste turno. Um uso por descanso curto/longo; dois no nível 17, apenas um por turno. O mestre concede a ação adicional na Mesa.',
    ),
    f(3, 'Arquétipo marcial', 'Escolha o arquétipo; habilidades nos níveis 7, 10, 15 e 18.'),
    f(
      5,
      'Ataque extra',
      'Dois ataques na ação Atacar; três no nível 11, quatro no 20. Não soma Ataque Extra de outras classes.',
    ),
    f(
      9,
      'Indomável',
      'Repita uma salvaguarda que falhou e use o novo resultado. Um uso por descanso longo, dois no nível 13 e três no 17.',
    ),
    ...asi([4, 6, 8, 12, 14, 16, 19]),
  ],
  monk: [
    f(
      1,
      'Defesa sem armadura',
      'CA = 10 + DES + SAB sem armadura ou escudo. Se já possui Defesa sem Armadura de outra classe, não ganha outra fórmula.',
    ),
    f(
      1,
      'Artes marciais',
      'Sem armadura/escudo, pode usar DES com ataques desarmados e armas de monge. Dano d4, d6 no nível 5, d8 no 11, d10 no 17; após Atacar, pode fazer um ataque desarmado bônus.',
    ),
    f(
      2,
      'Ki',
      'Pontos = nível de monge; descanso curto/longo com 30 minutos de meditação. CD de ki = 8 + proficiência + SAB. Rajada de Golpes, Defesa Paciente e Passo do Vento custam 1 ponto e ação bônus.',
    ),
    f(
      2,
      'Movimento sem armadura',
      'Sem armadura/escudo, +3 m; +4,5 no nível 6, +6 no 10, +7,5 no 14, +9 no 18. No nível 9 pode correr por superfícies verticais e líquidos no turno.',
    ),
    f(3, 'Tradição monástica', 'Escolha a tradição; habilidades nos níveis 6, 11 e 17.'),
    f(
      3,
      'Defletir projéteis',
      'Reação: reduz dano de ataque com arma à distância em 1d10 + DES + nível de monge; se reduzir a zero pode apanhar o projétil, e gastar 1 ki para arremessá-lo.',
    ),
    f(4, 'Queda lenta', 'Reação: reduz dano de queda em 5 × nível de monge.'),
    f(5, 'Ataque extra', 'Dois ataques na ação Atacar; não soma com outra classe.'),
    f(
      5,
      'Ataque atordoante',
      'Ao acertar ataque corpo a corpo com arma, pode gastar 1 ki: alvo faz CON contra CD de ki ou fica atordoado até fim do próximo turno.',
    ),
    f(6, 'Golpes de ki', 'Ataques desarmados contam como mágicos para resistência/imunidade.'),
    f(
      7,
      'Evasão',
      'Efeitos que permitem DES para metade do dano: sucesso causa zero, falha causa metade.',
    ),
    f(7, 'Mente tranquila', 'Ação: encerra um efeito que o deixa amedrontado ou enfeitiçado.'),
    f(10, 'Pureza corporal', 'Imune a doenças e veneno.'),
    f(
      13,
      'Idioma do sol e da lua',
      'Entende todos os idiomas falados; criaturas que entendem um idioma entendem você.',
    ),
    f(
      14,
      'Alma de diamante',
      'Proficiência em todas as salvaguardas; pode gastar 1 ki para repetir uma falha e aceitar o novo resultado.',
    ),
    f(
      15,
      'Corpo atemporal',
      'Sem fragilidade por idade e sem envelhecimento mágico; dispensa alimento/água, mas ainda pode morrer de velhice.',
    ),
    f(
      18,
      'Corpo vazio',
      'Ação e 4 ki: invisibilidade por 1 minuto e resistência a todos os danos exceto energia. 8 ki para Projeção Astral só em si.',
    ),
    f(20, 'Eu perfeito', 'Ao rolar iniciativa sem ki restante, recupera 4 pontos.'),
    ...asi(),
  ],
  paladin: [
    f(
      1,
      'Sentido divino',
      'Ação: até fim do próximo turno, detecta localização/tipo de celestiais, ínferos e mortos-vivos em 18 m sem cobertura total, e lugares/objetos consagrados. Usos = 1 + CAR por descanso longo.',
    ),
    f(
      1,
      'Impor as mãos',
      'Reserva de cura = 5 × nível de paladino por descanso longo. Ação e toque para distribuir PV; 5 pontos removem uma doença ou veneno. Sem efeito em construtos/mortos-vivos.',
    ),
    f(2, 'Estilo de luta', 'Escolha um estilo permitido para paladino.'),
    f(
      2,
      'Conjuração',
      'Carisma; prepara metade do nível de paladino arredondada para baixo + CAR magias (mínimo 1). Juramento concede magias sempre preparadas.',
    ),
    f(
      2,
      'Destruição divina',
      'Após acerto corpo a corpo, gaste espaço: +2d8 radiante no 1º círculo, +1d8 por círculo acima até 5d8; +1d8 contra ínferos/mortos-vivos, máximo 6d8. O mestre resolve esse dano adicional.',
    ),
    f(3, 'Saúde divina', 'Imune a doenças.'),
    f(
      3,
      'Juramento sagrado',
      'Escolha o juramento; Canalizar Divindade compartilha reserva com clérigo. Novas habilidades nos níveis 7, 15 e 20.',
    ),
    f(5, 'Ataque extra', 'Dois ataques na ação Atacar; não soma com outra classe.'),
    f(
      6,
      'Aura de proteção',
      'Você e aliados em 3 m somam CAR (mínimo +1) às salvaguardas enquanto está consciente. Raio 9 m no nível 18.',
    ),
    f(
      10,
      'Aura de coragem',
      'Você e aliados em 3 m não podem ser amedrontados enquanto está consciente; raio 9 m no nível 18.',
    ),
    f(
      11,
      'Destruição divina aprimorada',
      'Cada acerto corpo a corpo com arma causa +1d8 radiante.',
    ),
    f(
      14,
      'Toque purificador',
      'Ação: encerra uma magia em si ou criatura voluntária tocada. CAR usos (mínimo 1) por descanso longo.',
    ),
    ...asi(),
  ],
  ranger: [
    f(
      1,
      'Inimigo favorito',
      'Escolha um tipo de criatura ou dois tipos de humanoide e um idioma associado. Vantagem em rastrear e recordar informações sobre esse inimigo. Novas escolhas nos níveis 6 e 14.',
    ),
    f(
      1,
      'Explorador natural',
      'Escolha terreno favorito; novas escolhas nos níveis 6 e 10. Em viagens de uma hora ou mais nesse terreno, melhora navegação, coleta e rastreamento, conforme o mestre.',
    ),
    f(2, 'Estilo de luta', 'Escolha um estilo permitido para patrulheiro.'),
    f(
      2,
      'Conjuração',
      'Sabedoria; magias conhecidas conforme seu nível de patrulheiro, independente de níveis em outras classes.',
    ),
    f(3, 'Arquétipo de patrulheiro', 'Escolha o arquétipo; benefícios nos níveis 7, 11 e 15.'),
    f(
      3,
      'Consciência primitiva',
      'Ação e espaço: por 1 minuto por círculo, sente certos tipos de criatura até 1,5 km, ou 9 km em terreno favorito; não informa localização ou quantidade.',
    ),
    f(5, 'Ataque extra', 'Dois ataques na ação Atacar; não soma com outra classe.'),
    f(
      8,
      'Caminho da floresta',
      'Ignora custo de terreno difícil não mágico e vegetação não mágica; vantagem contra plantas criadas/manipuladas por magia para impedir movimento.',
    ),
    f(
      10,
      'Mimetismo',
      'Após 1 minuto preparando camuflagem, +10 em Furtividade parado contra superfície sólida larga; agir/mover-se exige preparar novamente.',
    ),
    f(
      14,
      'Desaparecer',
      'Esconder como ação bônus; não pode ser rastreado por meios não mágicos salvo se deixar pistas voluntariamente.',
    ),
    f(
      18,
      'Sentidos selvagens',
      'Sem desvantagem em ataques contra alvos que não vê; conhece posição de invisíveis em 9 m se não estiver escondidos e você não estiver cego/surdo.',
    ),
    f(
      20,
      'Matador de inimigos',
      'Uma vez por turno, soma SAB a ataque ou dano contra inimigo favorito, após rolar mas antes de aplicar o resultado.',
    ),
    ...asi(),
  ],
  rogue: [
    f(
      1,
      'Especialização',
      'Escolha duas perícias proficientes, ou uma perícia e ferramentas de ladrão, para dobrar proficiência. Mais duas escolhas no nível 6.',
    ),
    f(
      1,
      'Ataque furtivo',
      'Uma vez por turno, +1d6 por dois níveis de ladino arredondados para cima, com arma de acuidade/à distância. Requer vantagem ou aliado junto ao alvo e sem desvantagem; o mestre verifica condições.',
    ),
    f(1, 'Gíria de ladrões', 'Aprende linguagem secreta de ladrões, mensagens e sinais.'),
    f(
      2,
      'Ação ardilosa',
      'Pode Disparar, Desengajar ou Esconder como ação bônus; Disparar/Desengajar estão disponíveis na Mesa.',
    ),
    f(3, 'Arquétipo de ladino', 'Escolha seu arquétipo; habilidades nos níveis 9, 13 e 17.'),
    f(
      5,
      'Esquiva sobrenatural',
      'Reação ao ser acertado por atacante que vê: reduz pela metade o dano desse ataque.',
    ),
    f(7, 'Evasão', 'Salvaguarda de DES para metade: sucesso causa zero e falha causa metade.'),
    f(11, 'Talento confiável', 'Testes com proficiência tratam d20 de 9 ou menos como 10.'),
    f(14, 'Sentido cego', 'Se pode ouvir, percebe criaturas escondidas/invisíveis a 3 m.'),
    f(15, 'Mente escorregadia', 'Ganha proficiência em salvaguardas de Sabedoria.'),
    f(18, 'Elusivo', 'Nenhum ataque tem vantagem contra você enquanto não está incapacitado.'),
    f(
      20,
      'Golpe de sorte',
      'Transforme ataque perdido em acerto ou teste falho em d20 de 20; um uso por descanso curto/longo.',
    ),
    ...asi([4, 8, 10, 12, 16, 19]),
  ],
  sorcerer: [
    f(
      1,
      'Conjuração',
      'Carisma; magias conhecidas e foco arcano. Sua lista e seus limites usam apenas seu nível de feiticeiro.',
    ),
    f(1, 'Origem de feitiçaria', 'Escolha a origem; habilidades nos níveis 6, 14 e 18.'),
    f(
      2,
      'Fonte de magia',
      'Pontos de feitiçaria = nível de feiticeiro, recuperados em descanso longo. Ação bônus: espaço em pontos iguais ao círculo, ou pontos em espaços até 5º: custos 2, 3, 5, 6 e 7. Espaços criados são temporários e desaparecem no descanso longo; registre concessões especiais com o mestre.',
    ),
    f(
      3,
      'Metamagia',
      'Escolha duas opções; mais uma nos níveis 10 e 17. Em geral uma opção por magia, exceto quando a opção permite combinação.',
    ),
    f(20, 'Restauração feiticeira', 'Descanso curto recupera 4 pontos de feitiçaria.'),
    ...asi(),
  ],
  warlock: [
    f(
      1,
      'Patrono transcendental',
      'Escolha o patrono; habilidades nos níveis 6, 10 e 14. Magias ampliadas entram na lista, não são aprendidas automaticamente.',
    ),
    f(
      1,
      'Magia de pacto',
      'Carisma; espaços separados recuperam em descanso curto ou longo. Arcanos Místicos não usam espaços. Em multiclasse, pacto e espaços comuns podem conjurar magias conhecidas/preparadas das outras classes.',
    ),
    f(
      2,
      'Invocações místicas',
      'Escolha duas invocações; total 3 no nível 5, 4 no 7, 5 no 9, 6 no 12, 7 no 15, 8 no 18. Requisitos de nível usam nível de bruxo.',
    ),
    f(
      3,
      'Dádiva do pacto',
      'Escolha Corrente, Lâmina ou Tomo. Magias e escolhas extras são registradas no grimório como extras.',
    ),
    f(
      11,
      'Arcano místico',
      'Escolha uma magia de 6º círculo; uma de 7º no nível 13, 8º no 15, 9º no 17. Cada uma tem um uso por descanso longo.',
    ),
    f(
      20,
      'Mestre místico',
      'Uma vez por descanso longo, 1 minuto pedindo ajuda ao patrono recupera todos os espaços de pacto.',
    ),
    ...asi(),
  ],
  wizard: [
    f(
      1,
      'Conjuração',
      'Inteligência; começa com seis magias de 1º círculo no livro e aprende duas por nível de mago. Prepara nível de mago + INT (mínimo 1); rituais do livro não precisam estar preparados.',
    ),
    f(
      1,
      'Recuperação arcana',
      'Uma vez por dia após descanso curto, recupera espaços com soma dos círculos até metade do nível de mago arredondada para cima; nenhum de 6º ou superior. Escolha quais recuperar no grimório.',
    ),
    f(2, 'Tradição arcana', 'Escolha sua tradição; habilidades nos níveis 6, 10 e 14.'),
    f(
      18,
      'Domínio de magias',
      'Escolha uma magia de 1º e uma de 2º círculo do livro; preparadas, pode conjurá-las em seu círculo básico sem gastar espaço. Círculos superiores ainda gastam espaço.',
    ),
    f(
      20,
      'Magias de assinatura',
      'Escolha duas magias de 3º círculo do livro; sempre preparadas, fora do limite, e um uso gratuito de cada por descanso curto/longo.',
    ),
    ...asi(),
  ],
  artificer: [
    f(
      1,
      'Conjuração e engenhos',
      'Opção de suplemento já existente no catálogo. Usa Inteligência e progressão de espaços de artífice; consulte seu livro de 2014 para aplicar habilidades e infusões específicas.',
    ),
    f(
      3,
      'Especialidade de artífice',
      'Registre a especialidade personalizada e suas escolhas conforme o livro da mesa. Esta atualização não inclui o texto do suplemento.',
    ),
    ...asi(),
  ],
};
export const SUBCLASS_LEVELS: Record<string, number> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
  artificer: 3,
};
const path = (
  class_id: string,
  id: string,
  name: string,
  features: ClassFeature[],
  source = 'SRD 5.1',
): ClassPath => ({ class_id, id, name, features, level: SUBCLASS_LEVELS[class_id], source });
export const CLASS_PATHS: ClassPath[] = [
  path('barbarian', 'berserker', 'Berserker', [
    f(
      3,
      'Frenesi',
      'Ao entrar em fúria, pode fazer frenesi: a partir dos próximos turnos, um ataque corpo a corpo como ação bônus. Ao terminar a fúria, ganha um nível de exaustão.',
    ),
    f(
      6,
      'Fúria irracional',
      'Não pode ser amedrontado ou enfeitiçado durante a fúria; esses efeitos ficam suspensos.',
    ),
    f(
      10,
      'Presença intimidante',
      'Ação: alvo que vê em 9 m faz SAB, CD 8 + proficiência + CAR, ou fica amedrontado até fim do próximo turno. Pode prolongar com ações; sucesso protege por 24 horas.',
    ),
    f(
      14,
      'Retaliação',
      'Reação: ao sofrer dano de criatura em 1,5 m, pode fazer um ataque corpo a corpo contra ela.',
    ),
  ]),
  path('bard', 'lore', 'Colégio do Conhecimento', [
    f(3, 'Perícias adicionais', 'Escolha três novas perícias.'),
    f(
      3,
      'Palavras cortantes',
      'Reação e inspiração: reduz ataque, teste ou dano de criatura que ouve você em 18 m. Não afeta imunes a encantamento.',
    ),
    f(
      6,
      'Segredos mágicos adicionais',
      'Duas magias de qualquer classe até seu círculo de bardo, fora do limite de conhecidas; registre-as como extras.',
    ),
    f(
      14,
      'Perícia inigualável',
      'Pode gastar inspiração em seu próprio teste de atributo após rolar, antes do resultado.',
    ),
  ]),
  path('cleric', 'life', 'Domínio da Vida', [
    f(1, 'Proficiência adicional', 'Ganha proficiência em armaduras pesadas.'),
    f(
      1,
      'Discípulo da vida',
      'Magias de cura de 1º círculo ou maior curam +2 + círculo do espaço. A Mesa soma esse bônus ao dano/cura básico quando aplicável.',
    ),
    f(
      2,
      'Preservar a vida',
      'Canalizar Divindade: distribua 5 × nível de clérigo PV entre criaturas em 9 m, até metade dos PV máximos de cada; não afeta construtos/mortos-vivos.',
    ),
    f(
      6,
      'Curandeiro abençoado',
      'Ao curar outra criatura com magia de 1º círculo ou maior, você recupera 2 + círculo do espaço PV.',
    ),
    f(
      8,
      'Golpe divino',
      'Uma vez em seu turno, ataque com arma causa +1d8 radiante; +2d8 no nível 14.',
    ),
    f(
      17,
      'Cura suprema',
      'Quando rolar dados para cura de magia, use o máximo dos dados em vez de rolar.',
    ),
  ]),
  path('druid', 'land', 'Círculo da Terra', [
    f(2, 'Truque adicional', 'Aprende mais um truque de druida.'),
    f(
      2,
      'Recuperação natural',
      'Após descanso curto, recupera espaços cuja soma dos círculos não excede metade do nível de druida arredondada para cima, sem círculos 6+. Um uso por descanso longo.',
    ),
    f(
      3,
      'Magias de círculo',
      'Escolha o ambiente; recebe magias sempre preparadas nos níveis 3, 5, 7 e 9. Registre as magias do ambiente no grimório como extras.',
    ),
    f(
      6,
      'Caminho da floresta',
      'Ignora terreno difícil não mágico e vegetação comum; vantagem contra plantas mágicas que impedem movimento.',
    ),
    f(
      10,
      'Proteção natural',
      'Imune a veneno/doença; elementais e fadas não podem enfeitiçar ou amedrontar você.',
    ),
    f(
      14,
      'Santuário natural',
      'Animais e plantas que o atacam fazem SAB contra sua CD; falha obriga escolher outro alvo ou perder o ataque. A proteção cessa para a criatura se você a atacar.',
    ),
  ]),
  path('fighter', 'champion', 'Campeão', [
    f(3, 'Crítico aprimorado', 'Ataques com arma fazem crítico em 19 ou 20.'),
    f(
      7,
      'Atleta notável',
      'Metade da proficiência em testes de FOR, DES e CON sem proficiência; distância de salto longo aumenta em FOR metros convertidos de pés (0,3 × modificador).',
    ),
    f(10, 'Estilo de luta adicional', 'Escolha outro estilo de luta distinto do primeiro.'),
    f(15, 'Crítico superior', 'Ataques com arma fazem crítico em 18, 19 ou 20.'),
    f(
      18,
      'Sobrevivente',
      'No início do turno, se entre 1 PV e metade dos PV máximos, recupera 5 + CON PV.',
    ),
  ]),
  path('monk', 'open-hand', 'Caminho da Mão Aberta', [
    f(
      3,
      'Técnica da mão aberta',
      'Ao acertar com Rajada de Golpes, escolha: DES ou caído; FOR ou empurrar 4,5 m; ou impedir reações até fim do seu próximo turno.',
    ),
    f(6, 'Integridade corporal', 'Ação: cura 3 × nível de monge PV; um uso por descanso longo.'),
    f(
      11,
      'Tranquilidade',
      'Ao terminar descanso longo, ganha efeito de Santuário até início do próximo descanso longo; CD 8 + proficiência + SAB, termina se atacar ou afetar inimigo com magia.',
    ),
    f(
      17,
      'Palma vibrante',
      '3 ki após acertar ataque desarmado; duração em dias igual ao nível de monge. Ação para encerrar: alvo faz CON, falha reduz a 0 PV, sucesso causa 10d10 necrótico. Apenas uma criatura marcada.',
    ),
  ]),
  path('paladin', 'devotion', 'Juramento de Devoção', [
    f(
      3,
      'Arma sagrada',
      'Canalizar Divindade: ação, arma por 1 minuto soma CAR (mínimo +1) aos ataques e emite luz; é mágica se não era.',
    ),
    f(
      3,
      'Expulsar profanos',
      'Canalizar Divindade: ínferos/mortos-vivos em 9 m fazem SAB ou são expulsos por 1 minuto ou até sofrer dano.',
    ),
    f(
      7,
      'Aura de devoção',
      'Você e aliados em 3 m não podem ser enfeitiçados enquanto está consciente; 9 m no nível 18.',
    ),
    f(15, 'Pureza de espírito', 'Proteção contra o Bem e o Mal sempre ativa em você.'),
    f(
      20,
      'Aura sagrada',
      'Ação: luz em 9 m por 1 minuto; inimigos que começam nessa área sofrem 10 radiante. Vantagem nas salvaguardas contra magias de ínferos/mortos-vivos. Um uso por descanso longo.',
    ),
  ]),
  path('ranger', 'hunter', 'Caçador', [
    f(
      3,
      'Presa do caçador',
      'Escolha Matador de Colossos, Assassino de Gigantes ou Destruidor de Hordas.',
    ),
    f(
      7,
      'Táticas defensivas',
      'Escolha Fugir da Horda, Defesa contra Multiataque ou Vontade de Aço.',
    ),
    f(11, 'Multiataque', 'Escolha Saraivada ou Ataque Giratório.'),
    f(15, 'Defesa superior', 'Escolha Evasão, Manter-se Firme ou Esquiva Sobrenatural.'),
  ]),
  path('rogue', 'thief', 'Ladrão', [
    f(
      3,
      'Mãos rápidas',
      'Ação Ardilosa também permite Prestidigitação, ferramentas de ladrão para armadilhas/fechaduras, ou Usar um Objeto.',
    ),
    f(
      3,
      'Trabalho no segundo andar',
      'Escalar não custa movimento adicional; salto longo aumenta em 0,3 × DES metros.',
    ),
    f(
      9,
      'Furtividade suprema',
      'Vantagem em Furtividade se mover no máximo metade do deslocamento no turno.',
    ),
    f(
      13,
      'Usar instrumentos mágicos',
      'Ignora requisitos de classe, raça e nível ao usar itens mágicos.',
    ),
    f(
      17,
      'Reflexos de ladrão',
      'No primeiro round de cada combate, dois turnos: sua iniciativa e iniciativa menos 10. Não funciona surpreendido; o mestre organiza a ordem.',
    ),
  ]),
  path('sorcerer', 'draconic', 'Linhagem Dracônica', [
    f(
      1,
      'Ancestral dracônico',
      'Escolha cor/tipo do dragão. Aprende Dracônico; dobra proficiência em testes de CAR para interagir com dragões.',
    ),
    f(
      1,
      'Resiliência dracônica',
      '+1 PV por nível de feiticeiro. Sem armadura, CA = 13 + DES; ficha calcula ambos.',
    ),
    f(
      6,
      'Afinidade elemental',
      'Ao lançar magia com dano do tipo do ancestral, soma CAR a uma rolagem de dano; pode gastar 1 ponto para resistência ao tipo por 1 hora.',
    ),
    f(
      14,
      'Asas de dragão',
      'Ação bônus para criar/recolher asas; voo igual ao deslocamento, roupa/armadura deve acomodar asas.',
    ),
    f(
      18,
      'Presença dracônica',
      'Ação e 5 pontos: por 1 minuto, concentração, aura 18 m. SAB contra CD de feiticeiro ou encantado/amedrontado (escolha); sucesso protege por 24 horas.',
    ),
  ]),
  path('warlock', 'fiend', 'O Ínfero', [
    f(
      1,
      'Bênção do ínfero',
      'Quando reduz hostil a 0 PV, recebe PV temporários = CAR + nível de bruxo (mínimo 1); não acumula com outros PV temporários.',
    ),
    f(
      6,
      'Sorte do próprio obscuro',
      'Adicione 1d10 a teste de atributo ou salvaguarda após rolar, antes do resultado. Um uso por descanso curto/longo.',
    ),
    f(
      10,
      'Resistência ínfera',
      'Escolha um tipo de dano após descanso curto/longo; resistência, exceto dano de armas mágicas/prateadas.',
    ),
    f(
      14,
      'Lançar no inferno',
      'Após acertar ataque, transporta alvo até fim do próximo turno; se não for ínfero sofre 10d10 psíquico. Um uso por descanso longo.',
    ),
  ]),
  path('wizard', 'evocation', 'Escola de Evocação', [
    f(
      2,
      'Evocação erudita',
      'Tempo e ouro para copiar magias de evocação no livro são reduzidos à metade.',
    ),
    f(
      2,
      'Esculpir magias',
      'Em evocação que afeta outras criaturas vistas, proteja 1 + círculo da magia criaturas: sucesso automático na salvaguarda e zero dano quando sucesso normalmente daria metade.',
    ),
    f(
      6,
      'Truque potente',
      'Criatura que passa na salvaguarda de um truque seu ainda recebe metade do dano, sem efeito adicional.',
    ),
    f(10, 'Evocação fortalecida', 'Soma INT a uma rolagem de dano de magia de evocação de mago.'),
    f(
      14,
      'Sobrecarga',
      'Maximiza dano de magia de mago de 1º a 5º círculo. Primeiro uso sem custo por descanso longo; depois sofre 2d12 necrótico por círculo, +1d12 por repetição; não pode reduzir esse dano.',
    ),
  ]),
  path(
    'fighter',
    'eldritch-knight',
    'Cavaleiro Arcano',
    [
      f(
        3,
        'Conjuração de arquétipo',
        'Inteligência, magias de mago; progressão de um terço. Restrições de escolas e habilidades complementares seguem o livro da mesa.',
      ),
    ],
    'Opção de conjuração já existente',
  ),
  path(
    'rogue',
    'arcane-trickster',
    'Trapaceiro Arcano',
    [
      f(
        3,
        'Conjuração de arquétipo',
        'Inteligência, magias de mago; progressão de um terço. Restrições de escolas e habilidades complementares seguem o livro da mesa.',
      ),
    ],
    'Opção de conjuração já existente',
  ),
];
export const MULTICLASS_REQUIREMENTS: Record<string, Ability[][]> = {
  barbarian: [['str']],
  bard: [['cha']],
  cleric: [['wis']],
  druid: [['wis']],
  fighter: [['str', 'dex']],
  monk: [['dex'], ['wis']],
  paladin: [['str'], ['cha']],
  ranger: [['dex'], ['wis']],
  rogue: [['dex']],
  sorcerer: [['cha']],
  warlock: [['cha']],
  wizard: [['int']],
  artificer: [['int']],
};
export const CLASS_TRAINING: Record<
  string,
  { count: number; skills: string[]; initial: string[]; multi: string[] }
> = {
  barbarian: {
    count: 2,
    skills: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    initial: ['Armaduras leves e médias', 'Escudos', 'Armas simples e marciais'],
    multi: ['Escudos', 'Armas simples e marciais'],
  },
  bard: {
    count: 3,
    skills: SKILLS.map((s) => s.id),
    initial: [
      'Armaduras leves',
      'Armas simples, bestas de mão, espadas longas/curtas e rapieiras',
      'Três instrumentos musicais',
    ],
    multi: ['Armaduras leves', 'Uma perícia à escolha', 'Um instrumento musical'],
  },
  cleric: {
    count: 2,
    skills: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    initial: ['Armaduras leves e médias', 'Escudos', 'Armas simples'],
    multi: ['Armaduras leves e médias', 'Escudos'],
  },
  druid: {
    count: 2,
    skills: [
      'arcana',
      'animal_handling',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
    initial: [
      'Armaduras leves e médias não metálicas',
      'Escudos não metálicos',
      'Armas druídicas',
      'Kit de herbalismo',
    ],
    multi: ['Armaduras leves e médias não metálicas', 'Escudos não metálicos'],
  },
  fighter: {
    count: 2,
    skills: [
      'acrobatics',
      'animal_handling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'survival',
    ],
    initial: ['Todas as armaduras', 'Escudos', 'Armas simples e marciais'],
    multi: ['Armaduras leves e médias', 'Escudos', 'Armas simples e marciais'],
  },
  monk: {
    count: 2,
    skills: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    initial: ['Armas simples e espadas curtas', 'Uma ferramenta de artesão ou instrumento'],
    multi: ['Armas simples e espadas curtas'],
  },
  paladin: {
    count: 2,
    skills: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    initial: ['Todas as armaduras', 'Escudos', 'Armas simples e marciais'],
    multi: ['Armaduras leves e médias', 'Escudos', 'Armas simples e marciais'],
  },
  ranger: {
    count: 3,
    skills: [
      'animal_handling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
    initial: ['Armaduras leves e médias', 'Escudos', 'Armas simples e marciais'],
    multi: [
      'Armaduras leves e médias',
      'Escudos',
      'Armas simples e marciais',
      'Uma perícia da classe',
    ],
  },
  rogue: {
    count: 4,
    skills: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'performance',
      'persuasion',
      'sleight_of_hand',
      'stealth',
    ],
    initial: [
      'Armaduras leves',
      'Armas simples, bestas de mão, espadas longas/curtas e rapieiras',
      'Ferramentas de ladrão',
    ],
    multi: ['Armaduras leves', 'Uma perícia da classe', 'Ferramentas de ladrão'],
  },
  sorcerer: {
    count: 2,
    skills: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    initial: ['Adagas, dardos, fundas, bordões e bestas leves'],
    multi: [],
  },
  warlock: {
    count: 2,
    skills: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
    initial: ['Armaduras leves', 'Armas simples'],
    multi: ['Armaduras leves', 'Armas simples'],
  },
  wizard: {
    count: 2,
    skills: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    initial: ['Adagas, dardos, fundas, bordões e bestas leves'],
    multi: [],
  },
  artificer: {
    count: 2,
    skills: [
      'arcana',
      'history',
      'investigation',
      'medicine',
      'nature',
      'perception',
      'sleight_of_hand',
    ],
    initial: ['Consulte o suplemento da mesa'],
    multi: ['Consulte o suplemento da mesa'],
  },
};
export const FIGHTING_STYLES: ChoiceOption[] = [
  {
    id: 'archery',
    name: 'Arquearia',
    description: '+2 nas jogadas de ataque com armas à distância.',
  },
  { id: 'defense', name: 'Defesa', description: '+1 CA enquanto usa armadura.' },
  {
    id: 'dueling',
    name: 'Duelismo',
    description: '+2 dano com uma arma corpo a corpo em uma mão, sem outra arma; escudo permitido.',
  },
  {
    id: 'great-weapon',
    name: 'Combate com armas grandes',
    description:
      'Em dano de arma corpo a corpo empunhada com duas mãos, repita dados 1 ou 2 uma vez. Arma deve ter duas mãos ou versátil.',
  },
  {
    id: 'protection',
    name: 'Proteção',
    description:
      'Reação com escudo: impõe desvantagem a ataque de criatura vista contra outro alvo em 1,5 m.',
  },
  {
    id: 'two-weapon',
    name: 'Combate com duas armas',
    description: 'Adicione modificador de atributo ao dano do ataque com a segunda arma.',
  },
];
export const METAMAGIC: ChoiceOption[] = [
  {
    id: 'careful',
    name: 'Magia cuidadosa',
    description: '1 ponto: até CAR criaturas (mínimo 1) passam automaticamente na salvaguarda.',
  },
  {
    id: 'distant',
    name: 'Magia distante',
    description: '1 ponto: dobra alcance de pelo menos 1,5 m; toque passa a 9 m.',
  },
  {
    id: 'empowered',
    name: 'Magia potencializada',
    description:
      '1 ponto: repita até CAR dados de dano (mínimo 1), mantendo os novos resultados; pode combinar com outra metamagia.',
  },
  {
    id: 'extended',
    name: 'Magia prolongada',
    description: '1 ponto: dobra duração de pelo menos 1 minuto, até 24 horas.',
  },
  {
    id: 'heightened',
    name: 'Magia elevada',
    description: '3 pontos: um alvo tem desvantagem na primeira salvaguarda contra a magia.',
  },
  {
    id: 'quickened',
    name: 'Magia acelerada',
    description:
      '2 pontos: tempo de 1 ação passa a 1 ação bônus; regras de conjuração bônus ainda valem.',
  },
  {
    id: 'subtle',
    name: 'Magia sutil',
    description: '1 ponto: conjure sem componentes verbais/somáticos.',
  },
  {
    id: 'twinned',
    name: 'Magia duplicada',
    description:
      'Pontos iguais ao círculo (1 para truque): segundo alvo para magia que só pode atingir uma criatura e não tem alcance pessoal.',
  },
];
export const INVOCATIONS: ChoiceOption[] = [
  {
    id: 'agonizing-blast',
    name: 'Rajada agonizante',
    description: 'Requer Rajada Mística: soma CAR ao dano de cada acerto do truque.',
  },
  {
    id: 'armor-shadows',
    name: 'Armadura de sombras',
    description: 'Armadura Arcana em si sem espaço/componente.',
  },
  { id: 'beast-speech', name: 'Fala bestial', description: 'Falar com Animais sem espaço.' },
  {
    id: 'beguiling',
    name: 'Influência enganadora',
    description: 'Proficiência em Enganação e Persuasão.',
  },
  {
    id: 'devil-sight',
    name: 'Visão diabólica',
    description: 'Vê escuridão normal e mágica até 36 m.',
  },
  { id: 'eldritch-sight', name: 'Visão mística', description: 'Detectar Magia sem espaço.' },
  {
    id: 'eldritch-spear',
    name: 'Lança mística',
    description: 'Requer Rajada Mística: alcance 90 m.',
  },
  {
    id: 'eyes-rune',
    name: 'Olhos do guardião das runas',
    description: 'Pode ler todos os escritos.',
  },
  {
    id: 'fiendish-vigor',
    name: 'Vigor ínfero',
    description: 'Vida Falsa de 1º círculo em si sem espaço/componente.',
  },
  { id: 'mask-many', name: 'Máscara das muitas faces', description: 'Disfarçar-se sem espaço.' },
  {
    id: 'misty-visions',
    name: 'Visões nebulosas',
    description: 'Imagem Silenciosa sem espaço/componente.',
  },
  {
    id: 'repelling',
    name: 'Rajada repulsiva',
    description: 'Requer Rajada Mística: cada acerto pode empurrar alvo 3 m para longe.',
  },
  {
    id: 'voice-chain',
    name: 'Voz do mestre das correntes',
    description: 'Comunicação/sentidos do familiar no mesmo plano.',
    pact: 'chain',
  },
  {
    id: 'book-secrets',
    name: 'Livro dos segredos antigos',
    description:
      'Pacto do Tomo: dois rituais de 1º círculo de qualquer classe; pode copiar rituais até metade do nível de bruxo arredondada para cima.',
    pact: 'tome',
  },
  {
    id: 'thirsting-blade',
    name: 'Lâmina sedenta',
    description:
      'Pacto da Lâmina: dois ataques com arma de pacto na ação Atacar; não soma com Ataque Extra.',
    level: 5,
    pact: 'blade',
  },
  {
    id: 'one-shadows',
    name: 'Uno com as sombras',
    description: 'Ação em penumbra/escuridão: invisível até mover, agir ou reagir.',
    level: 5,
  },
  {
    id: 'ascendant-step',
    name: 'Passo ascendente',
    description: 'Levitação em si sem espaço/componente.',
    level: 9,
  },
  {
    id: 'otherworldly-leap',
    name: 'Salto transcendental',
    description: 'Salto em si sem espaço/componente.',
    level: 9,
  },
  {
    id: 'lifedrinker',
    name: 'Bebedor de vida',
    description: 'Arma de pacto soma CAR (mínimo 1) em dano necrótico.',
    level: 12,
    pact: 'blade',
  },
  {
    id: 'visions-realms',
    name: 'Visões de reinos distantes',
    description: 'Olho Arcano sem espaço.',
    level: 15,
  },
  {
    id: 'witch-sight',
    name: 'Visão de bruxa',
    description:
      'Vê forma verdadeira de metamorfos/ilusões de transmutação em criaturas vistas até 9 m.',
    level: 15,
  },
];
const options = (names: string[]): ChoiceOption[] =>
  names.map((name) => ({ id: name, name, description: name }));
const skillOptions = SKILLS.map((s) => ({
  id: s.id,
  name: s.label,
  description: 'Proficiência na perícia.',
}));
export function featureChoices(
  id: string,
  level: number,
  subclass = '',
  initial = true,
): FeatureChoice[] {
  const choices: FeatureChoice[] = [];
  if (!initial && ['bard', 'ranger', 'rogue'].includes(id))
    choices.push({
      id: 'multiclass-skill',
      name: 'Perícia de multiclasse',
      level: 1,
      count: 1,
      skills: true,
      options: skillOptions.filter(
        (s) => id === 'bard' || CLASS_TRAINING[id].skills.includes(s.id),
      ),
    });
  if (['fighter', 'ranger', 'paladin'].includes(id))
    choices.push({
      id: 'style',
      name: 'Estilo de luta',
      level: id === 'fighter' ? 1 : 2,
      count: 1,
      options: FIGHTING_STYLES.filter(
        (o) =>
          id === 'fighter' ||
          (id === 'paladin'
            ? ['defense', 'dueling', 'great-weapon', 'protection']
            : ['archery', 'defense', 'dueling', 'two-weapon']
          ).includes(o.id),
      ),
    });
  if (id === 'fighter' && subclass === 'champion')
    choices.push({
      id: 'second-style',
      name: 'Segundo estilo de luta',
      level: 10,
      count: 1,
      options: FIGHTING_STYLES,
    });
  if (['rogue', 'bard'].includes(id))
    for (const l of id === 'rogue' ? [1, 6] : [3, 10])
      choices.push({
        id: `expertise-${l}`,
        name: `Especialização · nível ${l}`,
        level: l,
        count: 2,
        expertise: true,
        options: [
          ...skillOptions,
          ...(id === 'rogue'
            ? [
                {
                  id: 'thieves-tools',
                  name: 'Ferramentas de ladrão',
                  description: 'Dobra a proficiência nas ferramentas.',
                },
              ]
            : []),
        ],
      });
  if (id === 'bard' && subclass === 'lore')
    choices.push({
      id: 'lore-skills',
      name: 'Perícias do Conhecimento',
      level: 3,
      count: 3,
      skills: true,
      options: skillOptions,
    });
  if (id === 'sorcerer')
    choices.push({
      id: 'metamagic',
      name: 'Metamagias',
      level: 3,
      count: level >= 17 ? 4 : level >= 10 ? 3 : 2,
      options: METAMAGIC,
    });
  if (id === 'sorcerer' && subclass === 'draconic')
    choices.push({
      id: 'dragon',
      name: 'Ancestral dracônico',
      level: 1,
      count: 1,
      options: options([
        'Azul · elétrico',
        'Branco · frio',
        'Bronze · elétrico',
        'Cobre · ácido',
        'Latão · fogo',
        'Negro · ácido',
        'Ouro · fogo',
        'Prata · frio',
        'Verde · veneno',
        'Vermelho · fogo',
      ]),
    });
  if (id === 'warlock') {
    choices.push({
      id: 'pact',
      name: 'Dádiva do pacto',
      level: 3,
      count: 1,
      options: [
        {
          id: 'chain',
          name: 'Corrente',
          description: 'Familiar com formas especiais; registre Encontrar Familiar como extra.',
        },
        {
          id: 'blade',
          name: 'Lâmina',
          description: 'Cria arma de pacto; é proficiente com ela e ela conta como mágica.',
        },
        {
          id: 'tome',
          name: 'Tomo',
          description:
            'Três truques de qualquer classe; usam CAR e não contam no limite de truques.',
        },
      ],
    });
    choices.push({
      id: 'invocations',
      name: 'Invocações místicas',
      level: 2,
      count:
        level >= 18
          ? 8
          : level >= 15
            ? 7
            : level >= 12
              ? 6
              : level >= 9
                ? 5
                : level >= 7
                  ? 4
                  : level >= 5
                    ? 3
                    : 2,
      options: INVOCATIONS,
    });
  }
  if (id === 'ranger') {
    for (const l of [1, 6, 14])
      choices.push({
        id: `enemy-${l}`,
        name: `Inimigo favorito · nível ${l}`,
        level: l,
        count: 1,
        options: options([
          'Aberrações',
          'Bestas',
          'Celestiais',
          'Construtos',
          'Corruptores',
          'Dragões',
          'Elementais',
          'Fadas',
          'Gigantes',
          'Limos',
          'Monstruosidades',
          'Mortos-vivos',
          'Dois tipos de humanoide (anote na História)',
        ]),
      });
    for (const l of [1, 6, 10])
      choices.push({
        id: `terrain-${l}`,
        name: `Terreno favorito · nível ${l}`,
        level: l,
        count: 1,
        options: options([
          'Ártico',
          'Costa',
          'Deserto',
          'Floresta',
          'Montanha',
          'Pântano',
          'Planície',
          'Subterrâneo',
        ]),
      });
    if (subclass === 'hunter')
      for (const [l, n, ops] of [
        [
          3,
          'Presa do caçador',
          [
            'Matador de Colossos · +1d8 uma vez/turno contra alvo ferido',
            'Assassino de Gigantes · reação contra ataque de Grande ou maior',
            'Destruidor de Hordas · ataque extra contra outro alvo adjacente',
          ],
        ],
        [
          7,
          'Táticas defensivas',
          [
            'Fugir da Horda · oportunidades têm desvantagem',
            'Defesa contra Multiataque · +4 CA após acerto do mesmo inimigo',
            'Vontade de Aço · vantagem contra medo',
          ],
        ],
        [
          11,
          'Multiataque',
          [
            'Saraivada · ataques à distância em área de raio 3 m',
            'Ataque Giratório · ataques corpo a corpo em 1,5 m',
          ],
        ],
        [
          15,
          'Defesa superior',
          ['Evasão', 'Manter-se Firme · reação redireciona ataque perdido', 'Esquiva Sobrenatural'],
        ],
      ] as const)
        choices.push({
          id: `hunter-${l}`,
          name: n,
          level: l,
          count: 1,
          options: options([...ops]),
        });
  }
  if (id === 'druid' && subclass === 'land')
    choices.push({
      id: 'land',
      name: 'Ambiente do círculo',
      level: 3,
      count: 1,
      options: options([
        'Ártico',
        'Costa',
        'Deserto',
        'Floresta',
        'Montanha',
        'Pântano',
        'Planície',
        'Subterrâneo',
      ]),
    });
  return choices.filter((c) => c.level <= level);
}
export const classFeatures = (id: string) =>
  [...(CLASS_FEATURES[id] ?? [])].sort((a, b) => a.level - b.level);
export const pathsFor = (id: string) => CLASS_PATHS.filter((p) => p.class_id === id);
export const classLabel = (id: string) => CLASSES[id]?.name ?? id;
