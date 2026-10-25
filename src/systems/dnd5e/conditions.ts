/** D&D 5e (2014). Keep the cumulative exhaustion track separate from named conditions. */
export const CONDITION_RULES = {
  Agarrado:
    'Deslocamento 0, sem bônus de deslocamento. Termina se o agarrador ficar incapacitado ou se o alvo sair do alcance do agarrão.',
  Amedrontado:
    'Desvantagem em ataques e testes de habilidade enquanto a fonte estiver à vista. Não pode se aproximar voluntariamente da fonte do medo.',
  Atordoado:
    'Incapacitado, sem movimento e fala entrecortada. Falha automaticamente em salvaguardas de Força e Destreza; ataques contra você têm vantagem.',
  Caído:
    'Só pode rastejar, pagando 1 unidade extra de movimento por unidade percorrida. Seus ataques têm desvantagem. Ataques contra você têm vantagem até 1,5 m e desvantagem além disso. Levantar custa metade do deslocamento.',
  Cego: 'Não enxerga e falha automaticamente em testes que dependem de visão. Seus ataques têm desvantagem e ataques contra você têm vantagem, salvo quando outro sentido permite perceber o alvo.',
  Enfeitiçado:
    'Não pode atacar quem o enfeitiçou nem usar habilidades ou efeitos nocivos contra essa criatura. O encantador tem vantagem em testes sociais contra você.',
  Envenenado: 'Desvantagem em ataques e testes de habilidade.',
  Impedido:
    'Deslocamento 0, sem bônus de deslocamento. Seus ataques e salvaguardas de Destreza têm desvantagem; ataques contra você têm vantagem.',
  Incapacitado:
    'Não pode realizar ações nem reações. Encerra a concentração. A condição, por si só, não zera seu deslocamento.',
  Inconsciente:
    'Incapacitado, sem movimento, fala ou percepção do ambiente; cai e larga o que segura. Falha em salvaguardas de Força e Destreza. Ataques contra você têm vantagem e acertos a até 1,5 m são críticos.',
  Invisível:
    'Não pode ser visto sem magia ou sentido especial; ainda pode ser localizado por ruído e rastros. Seus ataques têm vantagem e ataques contra você têm desvantagem. Fogo das Fadas pode neutralizar esses benefícios.',
  Paralisado:
    'Incapacitado, sem movimento nem fala. Falha em salvaguardas de Força e Destreza. Ataques contra você têm vantagem e acertos a até 1,5 m são críticos.',
  Petrificado:
    'Transformado em matéria sólida: incapacitado, imóvel, sem percepção, peso multiplicado por 10. Falha em salvaguardas de Força e Destreza; ataques contra você têm vantagem. Resiste a todo dano; venenos e doenças novos não o afetam, os existentes ficam suspensos.',
  Surdo: 'Não ouve e falha automaticamente em testes que dependem de audição.',
  Exaustão:
    'Efeitos cumulativos: 1 desvantagem em testes de habilidade; 2 metade do deslocamento; 3 desvantagem em ataques e salvaguardas; 4 metade dos PV máximos; 5 deslocamento 0; 6 morte. Um descanso longo com comida e água remove um nível.',
} as const;
export type DndCondition = keyof typeof CONDITION_RULES;
export const CONDITION_NAMES = Object.keys(CONDITION_RULES).sort((a, b) =>
  a.localeCompare(b, 'pt-BR'),
) as DndCondition[];
export const EXHAUSTION_STEPS = [
  'Sem exaustão',
  'Testes de habilidade com desvantagem',
  'Deslocamento pela metade',
  'Ataques e salvaguardas com desvantagem',
  'PV máximos pela metade',
  'Deslocamento 0',
  'Morte',
] as const;
export function exhaustionLevel(value: unknown, conditions: readonly string[] = []) {
  return Math.max(
    conditions.includes('Exaustão') ? 1 : 0,
    Math.min(6, Math.max(0, Math.floor(Number(value) || 0))),
  );
}
export const isIncapacitated = (conditions: readonly string[]) =>
  conditions.some((c) =>
    [
      'Incapacitado',
      'Atordoado',
      'Inconsciente',
      'Paralisado',
      'Petrificado',
      'Morto',
      'Dead',
    ].includes(c),
  );
export function conditionSpeed(speed: number, conditions: readonly string[], exhaustion = 0) {
  if (
    exhaustion >= 5 ||
    conditions.some((c) =>
      [
        'Agarrado',
        'Impedido',
        'Atordoado',
        'Inconsciente',
        'Paralisado',
        'Petrificado',
        'Morto',
        'Dead',
      ].includes(c),
    )
  )
    return 0;
  return Math.max(0, speed / (exhaustion >= 2 ? 2 : 1));
}
