import type { AtlasDocument, AtlasMap } from './types';
import { exportAtlasCanvas, THEMES } from './render';
import { serializeAtlas } from './model';
import { getSupabase } from '@/lib/supabase/client';
import type { BattleMap } from '@/features/vtt/types';
const filename = (title: string) =>
  title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'mapa';
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function blob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Não foi possível exportar a imagem.'))),
      type,
      quality,
    ),
  );
}
export async function downloadAtlasPng(
  doc: AtlasDocument,
  width = doc.width,
  includeTokens = true,
) {
  await document.fonts.ready;
  const safeWidth = Math.min(width, 4096, (4096 * doc.width) / doc.height);
  const image = await blob(exportAtlasCanvas(doc, safeWidth, includeTokens), 'image/png');
  download(image, `${filename(doc.title)}.png`);
}
export function downloadAtlasJson(doc: AtlasDocument) {
  download(
    new Blob([serializeAtlas(doc)], { type: 'application/json' }),
    `${filename(doc.title)}.cronica-map.json`,
  );
}
export async function sendAtlasScene(
  map: AtlasMap,
  chapterId: string,
  columns: number,
  rows: number,
  scale: number,
  onProgress: (message: string) => void,
) {
  onProgress('Preparando a cena…');
  const client = getSupabase();
  const { data, error } = await client.rpc('prepare_atlas_scene', {
    p_id: map.id,
    p_revision: map.revision,
    p_adventure_session_id: chapterId,
    p_columns: columns,
    p_rows: rows,
    p_scale: scale,
  });
  if (error) throw new Error(error.message);
  const prepared = data as { map: BattleMap; image_path: string };
  if (!prepared?.map?.id || !prepared.image_path)
    throw new Error('Não foi possível preparar a cena.');
  if (prepared.map.background_image) return prepared.map;
  onProgress('Desenhando o cenário…');
  await document.fonts.ready;
  // Planning tokens and the editor's grid/scale are not burned into a combat background.
  const canvas = exportAtlasCanvas(
    { ...map.document, grid: 'none', scaleBar: false },
    Math.min(2048, map.document.width),
    false,
  );
  const target = document.createElement('canvas'),
    ratio = columns / rows;
  target.width = Math.round(Math.min(2048, 2048 * ratio));
  target.height = Math.round(Math.min(2048, 2048 / ratio));
  const context = target.getContext('2d');
  if (!context) throw new Error('O navegador não conseguiu desenhar a imagem.');
  context.fillStyle = THEMES[map.document.theme].paper;
  context.fillRect(0, 0, target.width, target.height);
  const factor = Math.min(target.width / canvas.width, target.height / canvas.height);
  context.drawImage(
    canvas,
    (target.width - canvas.width * factor) / 2,
    (target.height - canvas.height * factor) / 2,
    canvas.width * factor,
    canvas.height * factor,
  );
  const image = await blob(target, 'image/webp', 0.86);
  if (image.size > 5 * 1024 * 1024)
    throw new Error(
      'A imagem do cenário ultrapassou 5 MB. Reduza os detalhes ou o tamanho do mapa.',
    );
  onProgress('Enviando a imagem…');
  await client.storage
    .from('campaign-media')
    .upload(prepared.image_path, image, { contentType: 'image/webp', upsert: false });
  // A previous upload may have succeeded while its response was lost. The server
  // checks the exact immutable object before attaching it, so retries can resume.
  const attached = await client.rpc('attach_atlas_scene_image', { p_map_id: prepared.map.id });
  if (attached.error) throw new Error(attached.error.message);
  if (!attached.data?.background_image)
    throw new Error(
      'A cena foi preparada, mas a imagem não foi confirmada. Tente enviar novamente.',
    );
  return attached.data as BattleMap;
}
