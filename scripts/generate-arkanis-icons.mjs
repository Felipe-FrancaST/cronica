// Original vector illustrations for the Arkanis ingredient catalogue. No external assets.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const ingredients = JSON.parse(
  await readFile(new URL('../src/systems/arkanis/data/ingredients.json', import.meta.url), 'utf8'),
);
const out = new URL('../public/icons/arkanis/ingredients/', import.meta.url);
await mkdir(out, { recursive: true });
const palettes = {
  mares: ['#51c8da', '#c39bff'],
  praias: ['#5ed0ad', '#f5d98b'],
  rios: ['#69d9ed', '#a2eacd'],
  pantanos: ['#92b859', '#c5a6eb'],
  tropicais: ['#4ec894', '#df9fcf'],
  bosques: ['#99b967', '#e3c17f'],
  campos: ['#d6b75c', '#ffdd91'],
  desertos: ['#e0a96c', '#b6a2ef'],
  montanhas: ['#a1b9d1', '#dce6f5'],
  cavernas: ['#9482d8', '#70e1da'],
  vulcoes: ['#f58f54', '#f7cf7e'],
  polares: ['#8ddcf4', '#e1f1ff'],
  ceus: ['#91bbf7', '#e4d6ff'],
  ruinas: ['#ac9abc', '#c4ddd2'],
  feericos: ['#d68bd0', '#a7efcd'],
  astrais: ['#ae8fe9', '#b6dffa'],
  cidades: ['#b9a07a', '#c6daeb'],
  amaldicoadas: ['#b17ca5', '#c7a5e7'],
};
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const leaf = (x = 48, y = 46, angle = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M0 22C-28 8-22-20 0-28C22-20 25 6 0 22Z" fill="url(#body)"/><path d="M0 22V-22M0 1L-12-9M0-9L11-18M0 11L12 1" fill="none" stroke="var(--shine)"/></g>`;
const crystal = (x = 48, y = 43, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0-30L15-14L14 19L0 32L-15 17L-14-14Z" fill="url(#body)"/><path d="M0-30L-4-9L0 32L7-8L15-14M-14-14L-4-9L7-8" fill="none" stroke="var(--shine)"/></g>`;
const drop = (fill = 'url(#body)') =>
  `<path d="M48 16C41 31 26 45 28 58C31 83 65 85 69 61C72 46 57 29 48 16Z" fill="${fill}"/><path d="M38 49Q29 62 41 67" fill="none" stroke="var(--shine)" stroke-width="3"/>`;
const petal = (angle, n = 0) =>
  `<g transform="translate(48 49) rotate(${angle})"><path d="M0 5C-16-8-13-29 0-34C13-29 16-8 0 5Z" fill="url(#body)"/><path d="M0-22V3" stroke="var(--shine)" opacity=".5"/></g>`;
const stem = `<path d="M48 52Q55 66 48 80" fill="none" stroke="var(--accent)" stroke-width="4"/><path d="M50 69Q28 70 30 57Q43 55 50 69" fill="var(--accent)"/>`;
const jar = (inside = '') =>
  `<path d="M37 26H59V34C59 40 69 42 69 55V70Q69 79 60 79H36Q27 79 27 70V55C27 42 37 40 37 34Z" fill="#192135"/><path d="M31 55Q48 49 65 55V70Q65 75 59 75H37Q31 75 31 69Z" fill="url(#body)"/><path d="M34 46V65" stroke="#f4f0d0" opacity=".55" stroke-width="3"/>${inside}<rect x="34" y="19" width="28" height="12" rx="3" fill="#a38767"/><path d="M39 22H57" stroke="#ead4a8"/>`;
const horn = `<path d="M32 75C29 48 43 28 71 17C57 40 61 58 46 77Z" fill="url(#body)"/><path d="M39 68L49 65M39 56L53 51M43 43L58 38M51 30L63 27" stroke="var(--shine)" fill="none"/>`;
const feather = `<path d="M29 77Q39 53 66 20" fill="none" stroke="var(--shine)" stroke-width="3"/><path d="M34 66C15 49 36 17 70 16C77 45 63 69 34 66Z" fill="url(#body)"/><path d="M31 73L69 19M42 58L29 51M50 48L36 36M57 38L49 24M45 54L61 55M54 42L70 41" fill="none" stroke="var(--shine)"/>`;
const powder = (n) =>
  `<path d="M22 72L38 51L51 43L65 58L77 74Q49 84 22 72Z" fill="url(#body)"/><path d="M31 68L44 57L55 61L62 69" fill="none" stroke="var(--shine)"/>${Array.from({ length: 9 }, (_, i) => `<circle cx="${27 + ((i * 17 + n) % 44)}" cy="${33 + ((i * 7) % 37)}" r="${1 + (i % 3) / 2}" fill="var(--shine)" stroke="none"/>`).join('')}`;
function shape(form, n) {
  const forms = {
    pearl: () =>
      `<circle cx="48" cy="49" r="27" fill="url(#pearl)"/><ellipse cx="39" cy="36" rx="8" ry="5" fill="#fff7e1" opacity=".8"/><path d="M26 61Q48 82 70 59" fill="none" stroke="var(--accent)"/>`,
    shell: () =>
      `<path d="M32 75L16 45Q16 17 46 18Q80 16 82 44L64 75Z" fill="url(#body)"/><path d="M34 72L24 38M41 72L37 26M49 73L49 24M57 73L64 28M64 71L74 40" stroke="var(--shine)"/><path d="M30 76Q48 64 66 76" fill="none" stroke-width="4"/>`,
    coral: () =>
      `<path d="M48 79V47M48 61L29 47V29M30 41L19 34V23M30 36L40 27V19M48 51L67 36V20M64 40L78 39V30M48 52V25" fill="none" stroke="var(--base)" stroke-width="8"/><path d="M47 77V47M30 46V31M68 34V22" fill="none" stroke="var(--shine)" stroke-width="2"/>`,
    ink: () =>
      jar(
        `<path d="M43 65Q47 51 53 61Q57 67 52 70Q47 66 43 71Z" fill="#17102d"/><path d="M65 38L77 15L70 20L60 39" fill="var(--accent)"/>`,
      ),
    fang: () =>
      `<path d="M28 26Q43 15 65 24L65 39Q64 63 35 81Q46 62 39 47L27 40Z" fill="url(#ivory)"/><path d="M39 30L51 33L52 49" fill="none" stroke="var(--base)"/><path d="M29 25L40 31L65 24" fill="#e1b57a"/>`,
    scale: () =>
      `${[-1, 0, 1].map((v, i) => `<path transform="translate(${v * 15} ${i === 1 ? -10 : 8})" d="M48 24L65 47L48 70L31 47Z" fill="url(#body)"/><path transform="translate(${v * 15} ${i === 1 ? -10 : 8})" d="M48 30L57 46L48 60" stroke="var(--shine)" fill="none"/>`).join('')}`,
    claw: () =>
      `<path d="M24 32Q38 15 59 24Q83 40 62 71Q60 43 46 43Q43 65 24 79Q34 53 24 32Z" fill="url(#body)"/><path d="M29 32Q56 17 67 44" fill="none" stroke="var(--shine)"/>`,
    core: () =>
      `<path d="M48 16L64 28L72 48L62 69L48 81L32 66L24 48L32 28Z" fill="url(#body)"/><path d="M48 24L42 42L56 48L45 72L50 53L37 48Z" fill="var(--shine)"/><ellipse cx="48" cy="48" rx="31" ry="12" fill="none" stroke="var(--accent)" transform="rotate(-32 48 48)"/>`,
    sand: () =>
      `<path d="M31 17H65V29L53 46V50L65 68V80H31V68L43 50V46L31 29Z" fill="#242239"/><path d="M35 25H61L49 44Z M35 75L48 58L61 75Z" fill="url(#body)"/><path d="M27 17H69M27 80H69" stroke="var(--shine)" stroke-width="5"/><path d="M48 45V55" stroke="var(--accent)"/>`,
    root: () =>
      `<path d="M47 25V57L34 75M47 46L27 53L20 67M47 55L60 70L76 76M49 40L63 48L72 46M47 57L48 80M28 53L27 41" stroke="var(--base)" stroke-width="7" fill="none"/>${leaf(47, 28, -15).replace('scale(1)', 'scale(.6)')}<path d="M47 48V59L35 75" stroke="var(--shine)" fill="none"/>`,
    carapace: () =>
      `<path d="M21 39L31 27L48 22L65 28L75 41L68 64L49 75L29 63Z" fill="url(#body)"/><path d="M48 29L35 42L36 59L49 67L62 58L62 43ZM22 43L35 42M61 43L74 42M49 67V74M35 59L29 64M62 58L68 64" stroke="var(--shine)" fill="none"/>`,
    salt: () =>
      `${crystal(36, 55, 0.65)}${crystal(60, 50, 0.8)}<path d="M21 77Q48 87 77 75" stroke="var(--accent)" fill="none"/>`,
    algae: () =>
      `<path d="M35 78C17 62 40 51 28 39C20 27 31 18 33 15C28 34 45 35 38 54C32 63 45 68 44 78M54 80C45 65 67 57 55 43C44 31 61 25 61 17C77 38 60 43 69 55C78 70 62 78 54 80Z" fill="url(#body)"/><path d="M40 78L34 55M57 77L63 58" stroke="var(--shine)"/>`,
    eye: () =>
      `<path d="M16 48Q47 14 80 48Q48 82 16 48Z" fill="url(#ivory)"/><circle cx="48" cy="48" r="18" fill="url(#body)"/><ellipse cx="48" cy="48" rx="${n % 2 ? 4 : 8}" ry="13" fill="#10101b"/><circle cx="43" cy="41" r="4" fill="#fff9e9" stroke="none"/>`,
    amber: () =>
      `<path d="M31 22L60 18L77 44L63 75L37 80L21 58Z" fill="url(#body)"/><path d="M46 39L55 49L46 60L39 49ZM39 48L31 42M54 49L65 43M45 59L43 68" fill="none" stroke="#714c43"/><path d="M32 29L56 24L65 36" fill="none" stroke="var(--shine)" stroke-width="3"/>`,
    cocoon: () =>
      `<path d="M47 17Q70 32 66 59Q64 79 48 82Q30 79 28 58Q25 32 47 17Z" fill="url(#body)"/><path d="M34 35L62 43M29 47L65 56M30 60L62 69M37 25L61 33M37 73L56 77" fill="none" stroke="var(--shine)"/>`,
    moss: () =>
      `<path d="M18 72Q11 54 28 54Q17 31 37 36Q37 12 51 30Q72 18 70 43Q89 43 76 62Q87 78 63 80H35Z" fill="url(#body)"/><path d="M27 70L39 53M49 74V43M63 68L68 54M26 48L33 44M57 38L61 32" fill="none" stroke="var(--shine)" stroke-width="3"/>`,
    flower: () =>
      `${stem}${Array.from({ length: n % 3 === 0 ? 6 : 5 }, (_, i) => petal((i * 360) / (n % 3 === 0 ? 6 : 5))).join('')}<circle cx="48" cy="49" r="8" fill="var(--accent)"/>`,
    drop: () => drop(),
    crystal: () => crystal(),
    powder: () => powder(n),
    wing: () =>
      `<path d="M46 51C6 48 16 17 30 17Q52 20 46 51C11 43 12 75 29 77Q44 74 48 55C53 81 75 83 79 67Q81 52 51 51C87 52 88 23 72 16Q52 14 46 51Z" fill="url(#body)"/><path d="M48 38V72M29 29L44 49L27 66M70 28L53 49L72 67" fill="none" stroke="var(--shine)" stroke-width="2"/>`,
    fin: () =>
      `<path d="M24 75Q42 48 34 18Q53 28 60 40L75 51L68 66L77 74Z" fill="url(#body)"/><path d="M29 73L38 28M35 74L51 38M43 74L61 48M53 74L67 59" stroke="var(--shine)" fill="none"/>`,
    mushroom: () =>
      `<path d="M41 43L38 76Q48 84 58 76L54 43Z" fill="url(#ivory)"/><path d="M15 48Q19 18 48 18Q75 18 81 48Q49 63 15 48Z" fill="url(#body)"/><circle cx="34" cy="36" r="5" fill="var(--shine)"/><circle cx="60" cy="30" r="4" fill="var(--shine)"/><path d="M22 48Q48 57 74 48" fill="none" stroke="var(--accent)"/>`,
    slime: () =>
      `<path d="M19 64Q20 45 35 45Q32 19 47 25Q58 28 54 45Q80 40 78 62Q84 81 62 79L32 80Q10 78 19 64Z" fill="url(#body)"/><circle cx="42" cy="58" r="7" fill="var(--shine)" opacity=".5"/><circle cx="62" cy="64" r="4" fill="var(--shine)"/>`,
    tongue: () =>
      `<path d="M26 29Q43 13 62 30L60 57Q61 77 43 79Q23 75 33 59Q39 52 43 60Q45 69 39 70Q52 75 52 58L50 37L26 43Z" fill="url(#body)"/><path d="M40 35L48 42V58" stroke="var(--shine)" fill="none"/>`,
    spores: () =>
      `${[
        [-15, 6, 8],
        [7, -4, 11],
        [18, 23, 7],
        [-7, 29, 5],
        [0, -22, 4],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${48 + x}" cy="${44 + y}" r="${r}" fill="url(#body)"/><path d="M${48 + x - r - 3} ${44 + y}h-4M${48 + x + r + 3} ${44 + y}h4" stroke="var(--accent)"/>`,
        )
        .join('')}`,
    blood: () => jar(`<path d="M48 48Q63 67 48 70Q34 67 48 48Z" fill="#a32448"/>`),
    lantern: () =>
      `<path d="M38 26Q48 8 58 26M36 29L25 59L38 79H58L71 59L60 29Z" fill="url(#body)"/><path d="M48 40Q35 56 41 65Q48 73 56 65Q64 53 48 40Z" fill="var(--shine)"/><path d="M36 29H60M27 60H69" stroke="var(--accent)" stroke-width="4"/>`,
    resin: () => jar(`<path d="M42 61Q48 47 55 61Q54 69 48 69Q41 68 42 61Z" fill="var(--shine)"/>`),
    seed: () =>
      `<path d="M31 72Q13 43 51 20Q78 29 71 54Q65 80 31 72Z" fill="url(#body)"/><path d="M31 72Q38 48 61 29" fill="none" stroke="var(--shine)" stroke-width="3"/><path d="M48 46Q57 39 67 44M37 58Q28 50 30 42" fill="none" stroke="var(--accent)"/>`,
    bark: () =>
      `<path d="M30 20L68 24L71 74L31 81L25 60Z" fill="url(#body)"/><path d="M38 27L35 44L42 55L37 75M56 29L52 43L60 59L54 74M27 60L39 57M61 36L68 34" fill="none" stroke="var(--shine)"/>`,
    acorn: () =>
      `<path d="M31 43Q23 72 48 82Q74 68 66 43Z" fill="url(#body)"/><path d="M24 46Q24 22 48 25Q71 23 73 46Z" fill="#8b7252"/><path d="M30 36L42 45M40 29L56 44M56 28L68 39M48 25V16" stroke="var(--shine)" fill="none"/>`,
    leaf: () => leaf(48, 49, n % 2 ? 20 : -20),
    grass: () =>
      `<path d="M44 82Q16 55 24 24Q29 48 44 54Q33 28 48 12Q46 39 54 55Q56 35 75 28Q58 58 58 81Z" fill="url(#body)"/><path d="M49 80V50" fill="none" stroke="var(--shine)" stroke-width="3"/>`,
    fur: () =>
      `<path d="M28 29L20 19L45 23L51 16L60 26L77 27L69 36L74 53L63 61L59 80L48 73L32 81L30 65L18 57L27 44Z" fill="url(#body)"/><path d="M32 40L43 47L34 64M48 31L59 43L51 59M62 50L56 70" stroke="var(--shine)" fill="none"/>`,
    horn: () => horn,
    honey: () =>
      jar(
        `<path d="M48 54L57 59V68L48 73L39 68V59Z" fill="none" stroke="var(--shine)"/><path d="M73 19L58 43" stroke="#d8bd82" stroke-width="5"/><ellipse cx="72" cy="20" rx="8" ry="5" transform="rotate(-50 72 20)" fill="var(--accent)"/>`,
      ),
    feather: () => feather,
    earth: () =>
      `<path d="M20 70L31 55L48 50L63 57L78 73L56 82L35 79Z" fill="url(#body)"/><path d="M31 64L41 59L55 65M27 72L41 75L47 68L65 75" stroke="var(--shine)" fill="none"/><path d="M46 47V28Q33 31 30 19Q45 15 47 28Q52 15 65 18Q63 33 49 31" fill="var(--accent)"/>`,
    venom: () =>
      jar(
        `<path d="M43 62Q32 51 47 49Q63 51 54 63L53 70L43 70Z" fill="#263623"/><path d="M42 56h2M51 56h2" stroke="var(--shine)"/>`,
      ),
    bone: () =>
      `<path d="M31 26Q19 17 17 30Q14 41 30 41L56 67Q51 80 65 80Q79 79 78 66Q78 55 68 58L42 31Q44 16 32 18Z" fill="url(#ivory)"/><path d="M33 38L59 65" stroke="var(--base)" fill="none"/>`,
    glass: () =>
      `<path d="M48 16L70 32L76 65L48 82L20 63L27 34Z" fill="url(#body)"/><path d="M48 16L45 43L20 63M45 43L70 32M45 43L48 82M45 43L76 65" stroke="var(--shine)" fill="none"/><path d="M35 35L42 25" stroke="#fff9ed" stroke-width="4"/>`,
    stone: () =>
      `<path d="M18 61L28 31L54 21L77 42L74 69L49 80L24 75Z" fill="url(#body)"/><path d="M28 31L42 51L54 21M42 51L74 69M42 51L24 75" fill="none" stroke="var(--shine)"/>`,
    egg: () =>
      `<path d="M48 17C62 21 75 48 72 65C67 86 28 87 24 65C21 46 35 21 48 17Z" fill="url(#body)"/><path d="M31 59L41 48L52 57L60 46L69 54" fill="none" stroke="var(--shine)"/><circle cx="37" cy="37" r="4" fill="var(--shine)"/>`,
    essence: () =>
      jar(
        `<path d="M39 66Q58 49 43 43Q67 41 56 65Q49 77 39 66Z" fill="var(--shine)" stroke="none"/>`,
      ),
    coin: () =>
      `<circle cx="48" cy="49" r="29" fill="url(#body)"/><circle cx="48" cy="49" r="23" fill="none" stroke="var(--shine)"/><path d="M48 32L58 41L54 57L48 66L42 57L38 41Z" fill="none" stroke="var(--shine)" stroke-width="3"/>`,
    fruit: () =>
      `<path d="M49 32Q23 17 23 47Q24 71 47 79Q73 75 75 49Q78 21 49 32Z" fill="url(#body)"/><path d="M49 35Q43 24 52 17" stroke="var(--shine)" stroke-width="3" fill="none"/><path d="M50 27Q57 9 72 20Q66 33 50 27Z" fill="var(--accent)"/><path d="M32 41Q26 52 35 62" stroke="var(--shine)" fill="none" stroke-width="3"/>`,
    mercury: () => drop('url(#metal)'),
    candle: () =>
      `<path d="M32 44H64V78H32Z" fill="url(#ivory)"/><path d="M33 44V58Q40 66 41 53L46 49Q53 64 55 49L62 45" fill="var(--base)"/><path d="M48 12Q66 31 50 42Q31 35 48 12Z" fill="url(#body)"/><path d="M48 28V44" stroke="var(--shine)"/><path d="M25 80H72" stroke="var(--accent)" stroke-width="4"/>`,
    gear: () =>
      `${Array.from({ length: 10 }, (_, i) => `<path transform="rotate(${i * 36} 48 48)" d="M42 16H54L56 29H40Z" fill="var(--base)"/>`).join('')}<circle cx="48" cy="48" r="24" fill="url(#metal)"/><circle cx="48" cy="48" r="12" fill="#1d2031"/><path d="M48 27V33M48 63V69M27 48H33M63 48H69" stroke="var(--shine)" stroke-width="3"/>`,
    star: () =>
      `<path d="M21 77L36 43L62 18L77 35L55 64Z" fill="url(#body)"/><path d="M61 14L67 27L81 29L71 39L73 53L60 46L47 53L50 38L40 29L55 26Z" fill="url(#ivory)"/><path d="M19 67L35 53M30 78L43 64" stroke="var(--accent)" stroke-width="3"/>`,
    lightning: () =>
      `<path d="M52 12L28 50L44 50L37 83L71 39L54 39L64 12Z" fill="url(#body)"/><path d="M49 25L37 44L52 45L45 64" stroke="var(--shine)" fill="none"/><circle cx="48" cy="48" r="35" stroke="var(--accent)" stroke-opacity=".5" fill="none"/>`,
    mirror: () =>
      `<path d="M29 18L65 22L73 66L46 82L22 54Z" fill="url(#metal)" stroke="var(--base)" stroke-width="5"/><path d="M37 28L59 33L63 56L43 70L32 50Z" fill="url(#body)"/><path d="M35 55L56 32M40 66L62 42" stroke="var(--shine)" stroke-width="3"/>`,
    jelly: () =>
      `<path d="M22 48Q24 17 48 17Q73 18 76 48Q49 61 22 48Z" fill="url(#body)"/><path d="M31 54Q19 66 34 79M43 56Q56 66 44 82M58 55Q45 68 61 79M69 53Q81 66 70 75" stroke="var(--accent)" stroke-width="4" fill="none"/><path d="M48 28L41 41H52L47 52L58 36H47Z" fill="var(--shine)"/>`,
  };
  if (!forms[form]) throw new Error('No illustration for ' + form);
  return forms[form]();
}
for (const item of ingredients) {
  let [base, accent] = palettes[item.habitat_id];
  if (/Sangue|Carmesim|Vermelho|Sangrenta/.test(item.name)) base = '#da6376';
  if (/Negra|Negro|Sombrio|Vazio/.test(item.name)) base = '#76619e';
  if (/Dourad|Áureo|Mel de|Âmbar/.test(item.name)) base = '#e6c06c';
  if (/Pratead|Branca|Gelo|Glacial/.test(item.name)) base = '#b9e7ef';
  if (/Azul/.test(item.name)) base = '#72aee8';
  if (/Roxo/.test(item.name)) base = '#b18bdb';
  const pearl = item.name.includes('Negra') ? ['#7d709d', '#171b32'] : ['#fff9e5', '#b3d6e3'];
  const n = item.number;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-labelledby="title"><title id="title">${escape(item.name)}</title><defs><radialGradient id="aura"><stop stop-color="${base}" stop-opacity=".28"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></radialGradient><linearGradient id="body" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${accent}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="#283047"/></linearGradient><radialGradient id="pearl" cx=".3" cy=".25" r=".8"><stop stop-color="${pearl[0]}"/><stop offset="1" stop-color="${pearl[1]}"/></radialGradient><linearGradient id="ivory" x2=".8" y2="1"><stop stop-color="#fff0cf"/><stop offset="1" stop-color="${base}"/></linearGradient><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#f5f4e4"/><stop offset=".4" stop-color="${base}"/><stop offset=".6" stop-color="#515e7e"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><g style="--base:${base};--accent:${accent};--shine:#f3e8c9" stroke="#182036" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><circle cx="48" cy="48" r="45" fill="#131a29" stroke="${base}" stroke-opacity=".35"/><circle cx="48" cy="48" r="43" fill="url(#aura)" stroke="none"/><ellipse cx="48" cy="80" rx="26" ry="5" fill="#080d18" opacity=".6" stroke="none"/><g transform="rotate(${((n % 5) - 2) * 2} 48 48)">${shape(item.form, n)}</g><path d="M${17 + (n % 8)} 16v8m-4-4h8M77 ${66 + (n % 12)}v6m-3-3h6" fill="none" stroke="${accent}" opacity=".85" stroke-width="1.4"/></g></svg>\n`;
  await writeFile(
    new URL(item.id + '.svg', out),
    svg
      .replaceAll('var(--base)', base)
      .replaceAll('var(--accent)', accent)
      .replaceAll('var(--shine)', '#f3e8c9'),
  );
}
console.log(`${ingredients.length} ícones SVG gerados em public/icons/arkanis/ingredients.`);
