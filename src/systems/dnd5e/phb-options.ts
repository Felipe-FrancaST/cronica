import { ARTISAN_TOOLS } from './backgrounds';
import type { ClassPath, ClassFeature, FeatureChoice } from './progression-catalog';
import type { DndSheet } from './types';
import type { FeatureResource } from './progression';
const f = (level: number, name: string, description: string): ClassFeature => ({
  level,
  name,
  description,
  id: name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-'),
});
const levels: Record<string, number> = {
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
const p = (class_id: string, id: string, name: string, features: ClassFeature[]): ClassPath => ({
  class_id,
  id,
  name,
  features,
  level: levels[class_id],
  source:
    class_id === 'artificer' ? 'Tasha’s Cauldron of Everything (2020)' : 'Livro do Jogador (2014)',
});
const erudition = (school: string) =>
  f(
    2,
    `${school} erudita`,
    `Copiar magias de ${school.toLowerCase()} para o grimório exige metade do tempo e do ouro habituais.`,
  );
/** Mechanical summaries written for the application; these are not book transcriptions. */
export const PHB_EXTRA_PATHS: ClassPath[] = [
  p('barbarian', 'totem-warrior', 'Guerreiro Totêmico', [
    f(3, 'Buscador espiritual', 'Pode conjurar Falar com Animais e Sentido Bestial como rituais.'),
    f(
      3,
      'Espírito totêmico',
      'Escolha urso, águia ou lobo. O benefício depende da fúria e do animal escolhido.',
    ),
    f(
      6,
      'Aspecto da besta',
      'Escolha um aspecto de urso, águia ou lobo, independentemente da escolha anterior.',
    ),
    f(
      10,
      'Andarilho espiritual',
      'Pode realizar Comunhão com a Natureza como ritual, representada por um espírito animal.',
    ),
    f(14, 'Sintonia totêmica', 'Escolha um benefício de urso, águia ou lobo para sua fúria.'),
  ]),
  p('bard', 'valor', 'Colégio da Bravura', [
    f(3, 'Proficiências adicionais', 'Armaduras médias, escudos e armas marciais.'),
    f(
      3,
      'Inspiração em combate',
      'A criatura inspirada também pode usar o dado no dano de uma arma ou, como reação, na CA contra um ataque.',
    ),
    f(
      6,
      'Ataque extra',
      'Pode atacar duas vezes com a ação Atacar. Não acumula com Ataque Extra de outra classe.',
    ),
    f(
      14,
      'Magia de batalha',
      'Ao conjurar uma magia de bardo com sua ação, pode fazer um ataque com arma como ação bônus.',
    ),
  ]),
  p('cleric', 'knowledge', 'Domínio do Conhecimento', [
    f(
      1,
      'Bênçãos do conhecimento',
      'Aprende dois idiomas e escolhe duas perícias entre Arcanismo, História, Natureza e Religião, com proficiência dobrada.',
    ),
    f(
      2,
      'Conhecimento das eras',
      'Canalizar Divindade: ganha proficiência temporária em uma perícia ou ferramenta por 10 minutos.',
    ),
    f(
      6,
      'Ler pensamentos',
      'Canalizar Divindade: sonda pensamentos com salvaguarda de SAB; pode encerrar para usar Sugestão sem gastar espaço.',
    ),
    f(8, 'Conjuração potente', 'Adiciona SAB ao dano de seus truques de clérigo.'),
    f(
      17,
      'Visões do passado',
      'Medita para obter visões sobre um objeto ou local. Duração e alcance da informação dependem do contexto; recupera em descanso curto ou longo.',
    ),
  ]),
  p('cleric', 'light', 'Domínio da Luz', [
    f(1, 'Truque adicional', 'Aprende Luz, sem ocupar o limite de truques de clérigo.'),
    f(
      1,
      'Labareda protetora',
      'Reação para impor desvantagem a um ataque de uma criatura vista a até 9 m; usos iguais a SAB, mínimo 1, por descanso longo.',
    ),
    f(
      2,
      'Radiação do amanhecer',
      'Canalizar Divindade: dissipa escuridão mágica e causa 2d10 + nível de clérigo radiante em criaturas hostis a até 9 m; CON reduz à metade.',
    ),
    f(
      6,
      'Labareda aprimorada',
      'Sua reação protetora também pode defender outra criatura a até 9 m.',
    ),
    f(8, 'Conjuração potente', 'Adiciona SAB ao dano dos truques de clérigo.'),
    f(
      17,
      'Coroa de luz',
      'Ação para criar luz por 1 minuto. Inimigos na luz plena têm desvantagem contra suas magias de fogo ou radiantes; encerra com outra ação.',
    ),
  ]),
  p('cleric', 'nature', 'Domínio da Natureza', [
    f(
      1,
      'Acólito da natureza',
      'Escolhe um truque de druida e proficiência em Lidar com Animais, Natureza ou Sobrevivência; ganha armaduras pesadas.',
    ),
    f(
      2,
      'Enfeitiçar animais e plantas',
      'Canalizar Divindade: bestas e plantas a até 9 m fazem salvaguarda de SAB contra encantamento por 1 minuto.',
    ),
    f(
      6,
      'Amortecer elementos',
      'Reação para dar resistência a ácido, frio, fogo, elétrico ou trovejante a uma criatura a até 9 m para uma ocorrência de dano.',
    ),
    f(
      8,
      'Golpe divino',
      'Uma vez no seu turno, arma causa +1d8 de frio, fogo ou elétrico; +2d8 a partir do nível 14.',
    ),
    f(
      17,
      'Mestre da natureza',
      'Pode comandar, como ação bônus, criaturas afetadas pelo seu encantamento de animais e plantas.',
    ),
  ]),
  p('cleric', 'tempest', 'Domínio da Tempestade', [
    f(1, 'Proficiências da tempestade', 'Ganha armas marciais e armaduras pesadas.'),
    f(
      1,
      'Ira da tempestade',
      'Reação após ser atingido por criatura a até 1,5 m: 2d8 elétrico ou trovejante, DES reduz à metade. Usos SAB, mínimo 1, por descanso longo.',
    ),
    f(
      2,
      'Ira destruidora',
      'Canalizar Divindade: maximiza uma rolagem de dano elétrico ou trovejante.',
    ),
    f(
      6,
      'Golpe de relâmpago',
      'Dano elétrico em criatura Grande ou menor pode empurrá-la até 3 m.',
    ),
    f(8, 'Golpe divino', 'Uma vez por turno, arma recebe +1d8 trovejante; +2d8 no nível 14.'),
    f(
      17,
      'Filho da tempestade',
      'Recebe deslocamento de voo igual ao deslocamento de caminhada enquanto estiver ao ar livre.',
    ),
  ]),
  p('cleric', 'trickery', 'Domínio da Enganação', [
    f(
      1,
      'Bênção do trapaceiro',
      'Ação para conceder vantagem em Furtividade a outra criatura por até 1 hora; afeta uma criatura por vez.',
    ),
    f(
      2,
      'Invocar duplicidade',
      'Canalizar Divindade: cria uma duplicata ilusória por 1 minuto, com concentração. Pode conjurar a partir dela; certas posições concedem vantagem.',
    ),
    f(
      6,
      'Manto de sombras',
      'Canalizar Divindade: fica invisível até o fim do próximo turno ou até atacar ou conjurar.',
    ),
    f(8, 'Golpe divino', 'Uma vez por turno, arma recebe +1d8 de veneno; +2d8 no nível 14.'),
    f(17, 'Duplicidade aprimorada', 'Invocar Duplicidade passa a criar até quatro duplicatas.'),
  ]),
  p('cleric', 'war', 'Domínio da Guerra', [
    f(1, 'Proficiências de guerra', 'Ganha armas marciais e armaduras pesadas.'),
    f(
      1,
      'Sacerdote da guerra',
      'Após usar Atacar, pode realizar um ataque com arma como ação bônus. Usos SAB, mínimo 1, por descanso longo.',
    ),
    f(
      2,
      'Ataque dirigido',
      'Canalizar Divindade: adiciona +10 a uma jogada de ataque após rolar e antes de conhecer o resultado.',
    ),
    f(
      6,
      'Bênção do deus da guerra',
      'Reação e Canalizar Divindade para conceder +10 ao ataque de outra criatura a até 9 m.',
    ),
    f(
      8,
      'Golpe divino',
      'Uma vez por turno, arma recebe +1d8 do mesmo tipo de dano; +2d8 no nível 14.',
    ),
    f(
      17,
      'Avatar da batalha',
      'Resistência a dano cortante, perfurante e de concussão de armas não mágicas.',
    ),
  ]),
  p('druid', 'moon', 'Círculo da Lua', [
    f(
      2,
      'Forma selvagem de combate',
      'Transforma-se como ação bônus; na forma animal, pode gastar espaço como ação bônus para recuperar 1d8 PV por círculo.',
    ),
    f(
      2,
      'Formas do círculo',
      'Pode usar bestas de ND 1; a partir do nível 6, ND até nível de druida dividido por 3. Restrições de natação e voo continuam seguindo o nível.',
    ),
    f(
      6,
      'Ataque primordial',
      'Ataques na forma animal contam como mágicos contra resistência e imunidade.',
    ),
    f(
      10,
      'Forma selvagem elemental',
      'Pode gastar dois usos de Forma Selvagem para assumir forma de elemental do ar, terra, fogo ou água.',
    ),
    f(14, 'Mil formas', 'Pode conjurar Alterar-se à vontade.'),
  ]),
  p('fighter', 'battle-master', 'Mestre de Batalha', [
    f(
      3,
      'Superioridade em combate',
      'Escolhe três manobras e recebe quatro dados d8 de superioridade. CD = 8 + proficiência + FOR ou DES.',
    ),
    f(3, 'Estudante da guerra', 'Ganha proficiência com uma ferramenta de artesão à escolha.'),
    f(
      7,
      'Conheça seu inimigo',
      'Após observar uma criatura por 1 minuto fora de combate, compara duas características suas com as dela. Ganha duas manobras e um dado de superioridade.',
    ),
    f(
      10,
      'Superioridade aprimorada',
      'Dados de superioridade tornam-se d10; aprende duas manobras. No nível 18, tornam-se d12.',
    ),
    f(
      15,
      'Implacável',
      'Se rolar iniciativa sem dados de superioridade, recupera um. Recebe mais um dado e aprende duas manobras.',
    ),
  ]),
  p('monk', 'shadow', 'Caminho da Sombra', [
    f(
      3,
      'Artes sombrias',
      'Aprende Ilusão Menor. Gasta 2 ki para Escuridão, Visão no Escuro, Passos sem Pegadas ou Silêncio, sem componentes materiais.',
    ),
    f(
      6,
      'Passo das sombras',
      'Em penumbra ou escuridão, ação bônus para teleportar até 18 m a outra área escura vista; ganha vantagem no próximo ataque corpo a corpo antes do fim do turno.',
    ),
    f(
      11,
      'Manto de sombras',
      'Ação para ficar invisível em penumbra ou escuridão, até atacar, conjurar ou entrar em luz plena.',
    ),
    f(
      17,
      'Oportunista',
      'Reação para atacar uma criatura a até 1,5 m quando outra criatura a atingir.',
    ),
  ]),
  p('monk', 'four-elements', 'Caminho dos Quatro Elementos', [
    f(
      3,
      'Discípulo dos elementos',
      'Aprende Sintonia Elemental e uma disciplina; aprende outra nos níveis 6, 11 e 17. Disciplinas usam ki e algumas permitem conjurar magias.',
    ),
    f(
      6,
      'Disciplinas adicionais',
      'Aprende uma disciplina adicional. Pode substituir uma disciplina já conhecida ao aprender uma nova.',
    ),
    f(
      11,
      'Disciplinas superiores',
      'Aprende uma disciplina adicional e pode escolher opções com requisito de nível 11.',
    ),
    f(
      17,
      'Maestria elemental',
      'Aprende uma disciplina adicional e pode escolher opções com requisito de nível 17. Limites de ki por magia: 3 até o nível 8, 4 até o 12, 5 até o 16 e 6 depois.',
    ),
  ]),
  p('paladin', 'ancients', 'Juramento dos Anciões', [
    f(
      3,
      'Canalizar divindade dos anciões',
      'Pode usar Ira da Natureza para conter uma criatura próxima, ou Expulsar os Infiéis contra fadas e corruptores.',
    ),
    f(
      7,
      'Aura de proteção mágica',
      'Você e aliados a até 3 m têm resistência a dano de magias; alcance de 9 m no nível 18.',
    ),
    f(
      15,
      'Sentinela imortal',
      'Ao cair a 0 PV sem morrer, pode ficar com 1 PV, uma vez por descanso longo. Não sofre fragilidade da velhice e não envelhece por magia.',
    ),
    f(
      20,
      'Campeão ancestral',
      'Ação para transformar-se por 1 minuto: cura 10 PV no início de cada turno, conjura certas magias como ação bônus e dificulta salvaguardas próximas. Um uso por descanso longo.',
    ),
  ]),
  p('paladin', 'vengeance', 'Juramento de Vingança', [
    f(
      3,
      'Canalizar divindade da vingança',
      'Abjurar Inimigo impõe medo e limita movimento; Voto de Inimizade concede vantagem contra um alvo por 1 minuto.',
    ),
    f(
      7,
      'Vingador implacável',
      'Ao acertar ataque de oportunidade, pode se mover até metade do deslocamento sem provocar oportunidades.',
    ),
    f(
      15,
      'Alma de vingança',
      'Reação para atacar o alvo do Voto de Inimizade quando ele realizar um ataque.',
    ),
    f(
      20,
      'Anjo vingador',
      'Ação para transformação de 1 hora com voo de 18 m e aura de medo. Um uso por descanso longo.',
    ),
  ]),
  p('ranger', 'beast-master', 'Mestre das Bestas', [
    f(
      3,
      'Companheiro animal',
      'Escolhe besta de tamanho Médio ou menor e ND até 1/4. Proficiência melhora suas estatísticas; PV máximos são o maior entre os PV normais e quatro vezes o nível de patrulheiro. Usa as regras originais de 2014.',
    ),
    f(
      7,
      'Treinamento excepcional',
      'Se o companheiro não atacar, pode comandar Correr, Desengajar ou Ajudar como ação bônus. Seus ataques passam a contar como mágicos.',
    ),
    f(
      11,
      'Fúria bestial',
      'Quando comandado a Atacar, o companheiro pode realizar dois ataques ou Multiataque, se possuir.',
    ),
    f(
      15,
      'Compartilhar magias',
      'Ao conjurar uma magia em si mesmo, pode também afetar o companheiro se ele estiver a até 9 m.',
    ),
  ]),
  p('rogue', 'assassin', 'Assassino', [
    f(3, 'Proficiências do assassino', 'Ganha proficiência com kit de disfarce e kit de venenos.'),
    f(
      3,
      'Assassinar',
      'Vantagem contra criaturas que ainda não agiram. Acertos contra uma criatura surpreendida são críticos; surpresa é definida pelo mestre.',
    ),
    f(
      9,
      'Especialista em infiltração',
      'Pode criar uma identidade falsa com 7 dias de trabalho e 25 PO, incluindo documentação e aparência social.',
    ),
    f(
      13,
      'Impostor',
      'Após estudar fala, escrita ou comportamento por 3 horas, pode imitá-los; testes para sustentar o disfarce recebem vantagem.',
    ),
    f(
      17,
      'Golpe mortal',
      'Ao acertar criatura surpreendida, ela faz salvaguarda de CON, CD 8 + DES + proficiência. Falha dobra o dano do ataque.',
    ),
  ]),
  p('sorcerer', 'wild-magic', 'Magia Selvagem', [
    f(
      1,
      'Surto de magia selvagem',
      'Após certas magias, o mestre pode pedir um d20; resultado 1 provoca um efeito da tabela de Magia Selvagem. A ocorrência e a resolução são conduzidas pelo mestre.',
    ),
    f(
      1,
      'Marés do caos',
      'Ganha vantagem em um ataque, teste ou salvaguarda. Recupera em descanso longo ou quando o mestre determinar um surto após uma magia apropriada.',
    ),
    f(
      6,
      'Dobrar a sorte',
      'Reação e 2 pontos de feitiçaria para adicionar ou subtrair 1d4 de uma jogada de outra criatura vista a até 18 m.',
    ),
    f(
      14,
      'Caos controlado',
      'Quando rolar na tabela de surtos, pode rolar duas vezes e escolher um resultado.',
    ),
    f(
      18,
      'Bombardeio mágico',
      'Uma vez por turno, se um dado de dano de magia obtiver o máximo, rola esse dado novamente e soma o resultado.',
    ),
  ]),
  p('warlock', 'archfey', 'A Arquifada', [
    f(
      1,
      'Presença feérica',
      'Ação: cubo de 3 m impõe encanto ou medo até o fim do seu próximo turno, com salvaguarda de SAB. Recupera em descanso curto ou longo.',
    ),
    f(
      6,
      'Fuga das brumas',
      'Reação ao sofrer dano: fica invisível e teleporta até 18 m; invisibilidade dura até o próximo turno ou até atacar/conjurar. Recupera em descanso curto ou longo.',
    ),
    f(
      10,
      'Defesas sedutoras',
      'Imunidade a encantamento; pode reagir para tentar devolver esse efeito à criatura que o provocou.',
    ),
    f(
      14,
      'Delírio sombrio',
      'Ação: prende uma criatura em uma ilusão, encantada ou amedrontada, com concentração e salvaguarda de SAB. Um uso por descanso curto ou longo.',
    ),
  ]),
  p('warlock', 'great-old-one', 'O Grande Antigo', [
    f(
      1,
      'Mente desperta',
      'Pode comunicar-se telepaticamente com criaturas vistas a até 9 m, desde que elas compreendam algum idioma.',
    ),
    f(
      6,
      'Proteção entrópica',
      'Reação para impor desvantagem a um ataque; se errar, ganha vantagem no próximo ataque contra aquele alvo antes do fim do próximo turno. Recupera em descanso curto ou longo.',
    ),
    f(
      10,
      'Escudo de pensamentos',
      'Seus pensamentos não podem ser lidos sem permissão. Resistência a dano psíquico; causar esse dano a você também afeta o agressor.',
    ),
    f(
      14,
      'Criar servo',
      'Pode tocar humanoide incapacitado para enfeitiçá-lo, mantendo comunicação telepática no mesmo plano. O efeito termina por remoção apropriada ou nova utilização.',
    ),
  ]),
  p('wizard', 'abjuration', 'Escola de Abjuração', [
    erudition('Abjuração'),
    f(
      2,
      'Proteção arcana',
      'Ao conjurar abjuração de 1º círculo ou maior, pode criar proteção com PV = 2 × nível de mago + INT. Ela absorve dano antes de você; novas abjurações recuperam 2 PV por círculo, até o máximo.',
    ),
    f(
      6,
      'Proteção projetada',
      'Reação para usar a proteção arcana para absorver dano de uma criatura vista a até 9 m.',
    ),
    f(
      10,
      'Abjuração aprimorada',
      'Adiciona proficiência aos testes exigidos por abjurações, como Contramágica e Dissipar Magia.',
    ),
    f(
      14,
      'Resistência à magia',
      'Vantagem em salvaguardas contra magias e resistência ao dano de magias.',
    ),
  ]),
  p('wizard', 'conjuration', 'Escola de Conjuração', [
    erudition('Conjuração'),
    f(
      2,
      'Conjuração menor',
      'Ação para criar objeto não mágico já visto, de até 90 cm e 5 kg. Ele brilha levemente e desaparece em 1 hora, ao sofrer/causar dano ou com nova conjuração.',
    ),
    f(
      6,
      'Transposição benigna',
      'Ação para teleportar até 9 m ou trocar de lugar com criatura Pequena ou Média voluntária. Recupera em descanso longo ou ao conjurar conjuração de 1º círculo ou maior.',
    ),
    f(
      10,
      'Conjuração focada',
      'Sofrer dano não interrompe sua concentração em magias de conjuração.',
    ),
    f(
      14,
      'Invocações duráveis',
      'Criaturas que você invoca ou cria com magias de conjuração recebem 30 PV temporários.',
    ),
  ]),
  p('wizard', 'divination', 'Escola de Adivinhação', [
    erudition('Adivinhação'),
    f(
      2,
      'Portento',
      'Após descanso longo, rola dois d20 e registra os resultados. Pode substituir uma jogada própria ou de uma criatura vista antes da rolagem; uma substituição por turno.',
    ),
    f(
      6,
      'Adivinho especialista',
      'Ao gastar espaço de 2º círculo ou maior em adivinhação, recupera um espaço de círculo inferior, no máximo 5º.',
    ),
    f(
      10,
      'O terceiro olho',
      'Ação para ganhar uma forma de percepção especial: visão no escuro, etérea, leitura ou ver invisível. Termina ao ficar incapacitado ou trocar o benefício; recupera em descanso curto ou longo.',
    ),
    f(14, 'Portento maior', 'Passa a registrar três d20 a cada descanso longo.'),
  ]),
  p('wizard', 'enchantment', 'Escola de Encantamento', [
    erudition('Encantamento'),
    f(
      2,
      'Olhar hipnótico',
      'Ação contra criatura a até 1,5 m: SAB evita encanto e incapacitação. Exige manutenção por ação, proximidade e não causar dano; sucesso impede repetir no mesmo alvo até descanso longo.',
    ),
    f(
      6,
      'Encanto instintivo',
      'Reação para tentar redirecionar um ataque de criatura vista a até 9 m contra outro alvo. SAB evita; não funciona em criaturas imunes a encantamento.',
    ),
    f(
      10,
      'Dividir encantamento',
      'Encantamento de 1º círculo ou maior que normalmente afeta uma criatura pode afetar duas.',
    ),
    f(
      14,
      'Alterar memórias',
      'Pode ocultar que enfeitiçou um alvo e, sob condições da habilidade, modificar a lembrança do período de encantamento.',
    ),
  ]),
  p('wizard', 'illusion', 'Escola de Ilusão', [
    erudition('Ilusão'),
    f(
      2,
      'Ilusão menor aprimorada',
      'Aprende Ilusão Menor, ou outro truque de mago se já o conhece. O truque pode combinar som e imagem.',
    ),
    f(
      6,
      'Ilusões moldáveis',
      'Ação para alterar a natureza de uma ilusão própria com duração de pelo menos 1 minuto, dentro dos limites da magia.',
    ),
    f(
      10,
      'Eu ilusório',
      'Reação para fazer um ataque contra você errar automaticamente. Um uso por descanso curto ou longo.',
    ),
    f(
      14,
      'Realidade ilusória',
      'Ao conjurar ilusão de 1º círculo ou maior, pode tornar real um objeto inanimado não mágico da ilusão por 1 minuto. Ele não pode causar dano direto.',
    ),
  ]),
  p('wizard', 'necromancy', 'Escola de Necromancia', [
    erudition('Necromancia'),
    f(
      2,
      'Colheita sinistra',
      'Uma vez por turno, ao matar criatura com magia de 1º círculo ou maior, recupera 2 PV por círculo, ou 3 para necromancia; não funciona com mortos-vivos ou construtos.',
    ),
    f(
      6,
      'Servos mortos-vivos',
      'Adiciona Animar Mortos ao grimório. A magia pode criar um morto-vivo adicional; criaturas criadas recebem PV extras iguais ao nível de mago e bônus de dano igual à proficiência.',
    ),
    f(
      10,
      'Acostumado à morte',
      'Resistência a dano necrótico e seu máximo de PV não pode ser reduzido.',
    ),
    f(
      14,
      'Comandar mortos-vivos',
      'Ação para tentar controlar morto-vivo visto a até 18 m, com salvaguarda de CAR. Inteligência elevada dá vantagens e novas tentativas ao alvo.',
    ),
  ]),
  p('wizard', 'transmutation', 'Escola de Transmutação', [
    erudition('Transmutação'),
    f(
      2,
      'Alquimia menor',
      'Pode alterar temporariamente um material não mágico entre madeira, pedra, ferro, cobre e prata; volume depende do tempo de trabalho.',
    ),
    f(
      6,
      'Pedra do transmutador',
      'Cria pedra que concede visão no escuro, +3 m de deslocamento, proficiência em CON ou resistência elemental. Pode alterar o benefício ao conjurar transmutação de 1º círculo ou maior.',
    ),
    f(
      10,
      'Metamorfo',
      'Adiciona Metamorfose ao grimório. Uma vez por descanso curto ou longo, pode usá-la em si mesmo sem espaço para assumir besta de ND até 1.',
    ),
    f(
      14,
      'Mestre transmutador',
      'Pode consumir a magia da pedra para transformar matéria, remover doenças e curar, rejuvenescer ou lançar Reviver os Mortos, respeitando os requisitos da opção.',
    ),
  ]),
  p('artificer', 'alchemist', 'Alquimista', [
    f(
      3,
      'Alquimista e elixir experimental',
      'Ganha suprimentos de alquimista. Produz elixir após descanso longo e pode gastar espaços para criar outros; resolve os efeitos conforme o suplemento.',
    ),
    f(
      5,
      'Alquimista erudito',
      'Certas magias conjuradas com suprimentos de alquimista recebem INT em uma rolagem de cura ou dano elegível.',
    ),
    f(
      9,
      'Reagentes restauradores',
      'Elixires concedem PV temporários; pode usar Restauração Menor sem espaço um número de vezes igual a INT por descanso longo.',
    ),
    f(
      15,
      'Maestria química',
      'Resistências e imunidades químicas, além de conjurações restauradoras limitadas pelo suplemento.',
    ),
  ]),
  p('artificer', 'armorer', 'Armeiro', [
    f(
      3,
      'Armadura arcana',
      'Ganha armaduras pesadas e ferramentas de ferreiro. Transforma sua armadura em foco e escolhe o modelo Guardião ou Infiltrador.',
    ),
    f(5, 'Ataque extra', 'Pode atacar duas vezes com Atacar, sem acumular com outra classe.'),
    f(
      9,
      'Modificações de armadura',
      'Partes da armadura arcana podem receber infusões separadas; ganha duas infusões ativas adicionais aplicáveis à armadura.',
    ),
    f(
      15,
      'Armadura aperfeiçoada',
      'O modelo recebe melhorias de defesa e controle, ou de ataque e infiltração, conforme o suplemento.',
    ),
  ]),
  p('artificer', 'artillerist', 'Artilheiro', [
    f(
      3,
      'Canhão arcano',
      'Ganha ferramentas de entalhador. Cria canhão minúsculo ou pequeno com uma das três configurações do suplemento.',
    ),
    f(
      5,
      'Arma de fogo arcana',
      'Transforma um foco compatível em arma de fogo arcana, acrescentando 1d8 ao dano de uma magia de artífice conjurada por ele.',
    ),
    f(9, 'Canhão explosivo', 'Canhões causam mais dano e podem ser detonados por uma ação.'),
    f(
      15,
      'Posição fortificada',
      'Melhora a proteção próxima aos canhões e permite manter dois simultaneamente.',
    ),
  ]),
  p('artificer', 'battle-smith', 'Ferreiro de Batalha', [
    f(
      3,
      'Prontidão de batalha',
      'Ganha ferramentas de ferreiro e armas marciais; pode usar INT com arma mágica. Constrói um defensor de aço.',
    ),
    f(5, 'Ataque extra', 'Pode atacar duas vezes com Atacar, sem acumular com outra classe.'),
    f(
      9,
      'Abalo arcano',
      'Acertos elegíveis da arma mágica ou do defensor podem causar dano adicional ou curar um aliado; limite de usos por INT.',
    ),
    f(
      15,
      'Defensor aprimorado',
      'Defensor e Abalo Arcano recebem melhorias definidas no suplemento.',
    ),
  ]),
];
export const PHB_PATH_COMPLETIONS: Record<string, ClassFeature[]> = {
  'eldritch-knight': [
    f(
      3,
      'Vínculo com arma',
      'Vincula até duas armas após ritual. Não pode ser desarmado delas se consciente e pode invocá-las como ação bônus.',
    ),
    f(
      7,
      'Magia de guerra',
      'Após conjurar um truque com sua ação, pode atacar com arma como ação bônus.',
    ),
    f(
      10,
      'Golpe místico',
      'Um alvo atingido pela sua arma tem desvantagem na próxima salvaguarda contra uma magia sua antes do fim do próximo turno.',
    ),
    f(
      15,
      'Investida arcana',
      'Ao usar Surto de Ação, pode teleportar até 9 m antes ou depois da ação adicional.',
    ),
    f(
      18,
      'Magia de guerra aprimorada',
      'O ataque como ação bônus também pode acompanhar uma magia de 1º círculo ou maior conjurada com sua ação.',
    ),
  ],
  'arcane-trickster': [
    f(
      3,
      'Mãos mágicas furtivas',
      'Aprende Mãos Mágicas; a mão pode ser invisível e realizar tarefas furtivas, como usar ferramentas de ladrão à distância.',
    ),
    f(
      9,
      'Emboscada mágica',
      'Criatura da qual estiver escondido tem desvantagem na salvaguarda contra uma magia que você conjurar naquele turno.',
    ),
    f(
      13,
      'Trapaceiro versátil',
      'Pode usar a mão mágica para distrair um alvo próximo dela, concedendo vantagem contra ele até o fim do turno.',
    ),
    f(
      17,
      'Ladrão de magias',
      'Reação para tentar negar uma magia que o afete e aprender a conjurá-la temporariamente, respeitando círculo e salvaguarda da habilidade.',
    ),
  ],
};
const opts = (names: string[]) =>
  names.map((name, i) => ({ id: String(i + 1), name, description: '' }));
export function phbFeatureChoices(id: string, level: number, sub: string): FeatureChoice[] {
  const result: FeatureChoice[] = [];
  if (id === 'barbarian' && sub === 'totem-warrior')
    for (const l of [3, 6, 14])
      result.push({
        id: `totem-${l}`,
        name: `Totem · nível ${l}`,
        level: l,
        count: 1,
        options: [
          {
            id: 'bear',
            name: 'Urso',
            description:
              l === 3
                ? 'Resistência a todo dano, exceto psíquico, em fúria.'
                : l === 6
                  ? 'Maior capacidade de carga e vantagem em certos testes de Força.'
                  : 'Dificulta ataques de inimigos próximos contra seus aliados.',
          },
          {
            id: 'eagle',
            name: 'Águia',
            description:
              l === 3
                ? 'Ação bônus para Correr e oportunidades contra você com desvantagem.'
                : l === 6
                  ? 'Visão distante e sem penalidade de penumbra à Percepção.'
                  : 'Voo durante o turno em fúria; cai se terminar no ar sem sustentação.',
          },
          {
            id: 'wolf',
            name: 'Lobo',
            description:
              l === 3
                ? 'Aliados próximos têm vantagem em ataques corpo a corpo contra inimigos ao seu lado.'
                : l === 6
                  ? 'Rastreamento e furtividade melhores em viagem.'
                  : 'Ação bônus após acerto para derrubar alvo Grande ou menor.',
          },
        ],
      });
  if (id === 'fighter' && sub === 'battle-master')
    result.push({
      id: 'maneuvers',
      name: 'Manobras de combate',
      level: 3,
      count: level >= 15 ? 9 : level >= 10 ? 7 : level >= 7 ? 5 : 3,
      options: opts([
        'Ataque ameaçador',
        'Ataque de desarme',
        'Ataque de distração',
        'Ataque de empurrão',
        'Ataque de finta',
        'Ataque de manobra',
        'Ataque de precisão',
        'Ataque provocante',
        'Ataque amplo',
        'Ataque com alcance',
        'Ataque derrubador',
        'Contra-ataque',
        'Golpe do comandante',
        'Inspirar',
        'Jogo de pés evasivo',
        'Aparar',
      ]),
    });
  if (id === 'fighter' && sub === 'battle-master')
    result.push({
      id: 'war-tools',
      name: 'Ferramenta de artesão do Estudante da Guerra',
      level: 3,
      count: 1,
      options: ARTISAN_TOOLS.map((name) => ({ id: name, name, description: '' })),
    });
  if (id === 'cleric' && sub === 'knowledge') {
    result.push({
      id: 'knowledge-skills',
      name: 'Perícias do Domínio do Conhecimento',
      level: 1,
      count: 2,
      skills: true,
      expertise: true,
      options: [
        { id: 'arcana', name: 'Arcanismo', description: '' },
        { id: 'history', name: 'História', description: '' },
        { id: 'nature', name: 'Natureza', description: '' },
        { id: 'religion', name: 'Religião', description: '' },
      ],
    });
    result.push({
      id: 'knowledge-languages',
      name: 'Idiomas do Domínio do Conhecimento',
      level: 1,
      count: 2,
      options: opts([
        'Comum',
        'Anão',
        'Élfico',
        'Gigante',
        'Gnômico',
        'Goblin',
        'Halfling',
        'Orc',
        'Abissal',
        'Celestial',
        'Dracônico',
        'Infernal',
        'Primordial',
        'Silvestre',
        'Subcomum',
      ]),
    });
  }
  if (id === 'cleric' && sub === 'nature')
    result.push({
      id: 'nature-skill',
      name: 'Perícia do Acólito da Natureza',
      level: 1,
      count: 1,
      skills: true,
      options: [
        { id: 'animal_handling', name: 'Lidar com Animais', description: '' },
        { id: 'nature', name: 'Natureza', description: '' },
        { id: 'survival', name: 'Sobrevivência', description: '' },
      ],
    });
  if (id === 'monk' && sub === 'four-elements')
    result.push({
      id: 'disciplines',
      name: 'Disciplinas elementais conhecidas',
      level: 3,
      count: level >= 17 ? 5 : level >= 11 ? 4 : level >= 6 ? 3 : 2,
      required: level < 6 ? ['attunement'] : [],
      options: [
        ['fangs', 'Presas da Serpente de Fogo', 3],
        ['fist', 'Punho dos Quatro Trovões · Onda Trovejante', 3],
        ['air', 'Punho do Ar Ininterrupto', 3],
        ['flames', 'Chamas da Fênix · Bola de Fogo', 11],
        ['gong', 'Gongo do Cume · Despedaçar', 6],
        ['mist', 'Forma da Névoa · Forma Gasosa', 11],
        ['water', 'Chicote de Água', 3],
        ['river', 'Forma do Rio Fluente', 3],
        ['rush', 'Rajada dos Espíritos do Vendaval · Rajada de Vento', 3],
        ['ride', 'Cavalgar o Vento · Voo', 11],
        ['snake', 'Sopro do Dragão · Mãos Flamejantes', 3],
        ['hold', 'Imobilização da Pessoa · Imobilizar Pessoa', 6],
        ['defense', 'Defesa da Montanha Eterna · Pele de Pedra', 17],
        ['earth', 'Onda da Terra · Muralha de Pedra', 17],
        ['fire-wall', 'Rio de Chamas Famintas · Muralha de Fogo', 17],
        ['storm', 'Respiração do Inverno · Cone de Frio', 17],
        ['attunement', 'Sintonia Elemental', 3],
      ].map(([id, name, level]) => ({
        id: String(id),
        name: String(name),
        level: Number(level),
        description:
          'Resolva a magia ou o efeito gastando o ki indicado pela disciplina; CD de ki baseada em SAB.',
      })),
    });
  if (id === 'artificer' && sub === 'armorer')
    result.push({
      id: 'armor-model',
      name: 'Modelo da armadura arcana',
      level: 3,
      count: 1,
      options: opts(['Guardião', 'Infiltrador']),
    });
  return result.filter((c) => c.level <= level);
}
export function additionalFeatureResources(s: DndSheet): FeatureResource[] {
  const result: FeatureResource[] = [],
    mod = (a: 'int' | 'wis') => Math.max(1, Math.floor((s.abilities[a] - 10) / 2));
  const add = (id: string, name: string, max: number, rest: 'short' | 'long') =>
    result.push({
      id,
      name,
      max,
      rest,
      description: 'Resolva o efeito conforme a descrição da habilidade.',
    });
  for (const c of s.class_levels?.length
    ? s.class_levels
    : [{ class_id: s.class_id, subclass_id: s.subclass_id, level: s.level }]) {
    if (c.class_id === 'fighter' && c.subclass_id === 'battle-master' && c.level >= 3)
      add(
        'fighter:superiority',
        'Dados de superioridade',
        c.level >= 15 ? 6 : c.level >= 7 ? 5 : 4,
        'short',
      );
    if (c.class_id === 'wizard' && c.subclass_id === 'divination' && c.level >= 2)
      add('wizard:portent', 'Portentos', c.level >= 14 ? 3 : 2, 'long');
    if (c.class_id === 'wizard' && c.subclass_id === 'illusion' && c.level >= 10)
      add('wizard:illusory-self', 'Eu ilusório', 1, 'short');
    if (c.class_id === 'cleric' && ['light', 'tempest', 'war'].includes(c.subclass_id ?? ''))
      add(
        `cleric:${c.subclass_id}`,
        c.subclass_id === 'light'
          ? 'Labaredas protetoras'
          : c.subclass_id === 'tempest'
            ? 'Ira da tempestade'
            : 'Sacerdote da guerra',
        mod('wis'),
        'long',
      );
    if (c.class_id === 'sorcerer' && c.subclass_id === 'wild-magic')
      add('sorcerer:tides', 'Marés do caos', 1, 'long');
    if (c.class_id === 'warlock' && c.subclass_id === 'archfey') {
      add('warlock:fey-presence', 'Presença feérica', 1, 'short');
      if (c.level >= 6) add('warlock:misty-escape', 'Fuga das brumas', 1, 'short');
      if (c.level >= 14) add('warlock:dark-delirium', 'Delírio sombrio', 1, 'short');
    }
    if (c.class_id === 'warlock' && c.subclass_id === 'great-old-one' && c.level >= 6)
      add('warlock:entropic-ward', 'Proteção entrópica', 1, 'short');
    if (c.class_id === 'paladin' && c.subclass_id === 'ancients' && c.level >= 15)
      add('paladin:undying', 'Sentinela imortal', 1, 'long');
    if (
      c.class_id === 'paladin' &&
      ['ancients', 'vengeance'].includes(c.subclass_id ?? '') &&
      c.level >= 20
    )
      add(`paladin:${c.subclass_id}`, 'Transformação do juramento', 1, 'long');
  }
  return result;
}
