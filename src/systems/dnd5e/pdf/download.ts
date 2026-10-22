import type { Character } from '@/types';
import { resolveImage } from '@/services/storage';
import type { CharacterPdfAssets } from './generate';
import type { CharacterPdfContext } from './model';
import type { CharacterPdfResult } from './worker';

async function asset(path: string) {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(30000),
    credentials: 'same-origin',
  });
  if (!response.ok)
    throw new Error(
      'Não foi possível carregar o modelo da ficha PDF. Confira sua conexão e tente novamente.',
    );
  return new Uint8Array(await response.arrayBuffer());
}

async function portraitBytes(character: Character, demo: boolean, file?: File | null) {
  let blob: Blob;
  if (file) blob = file;
  else {
    if (!character.portrait_path) return;
    const url = await resolveImage(character.portrait_path, demo);
    if (!url) throw new Error('Retrato indisponível.');
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Retrato indisponível.');
    blob = await response.blob();
  }
  // Normalize WebP/JPG/PNG to a bounded PNG, including EXIF orientation.
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar o retrato.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('Não foi possível preparar o retrato.')),
        'image/png',
      ),
    );
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function characterPdfFilename(name: string) {
  return `${
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'personagem'
  }-ficha-dnd5e.pdf`;
}

function renderInWorker(
  character: Character,
  context: CharacterPdfContext,
  assets: CharacterPdfAssets,
) {
  return new Promise<Extract<CharacterPdfResult, { ok: true }>>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('A geração do PDF excedeu o tempo de espera. Tente novamente.'));
    }, 120000);
    const close = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<CharacterPdfResult>) => {
      close();
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      close();
      reject(
        new Error('Não foi possível iniciar a exportação. Recarregue a página e tente novamente.'),
      );
    };
    worker.postMessage({ character, context, assets });
  });
}

export async function downloadCharacterPdf(
  character: Character,
  context: CharacterPdfContext,
  demo: boolean,
  file?: File | null,
) {
  const [template, font, portrait] = await Promise.all([
    asset('/character-sheet/dnd5e-editable-v1.pdf'),
    asset('/character-sheet/DejaVuSans.ttf'),
    portraitBytes(character, demo, file)
      .then((bytes) => ({ bytes, failed: false }))
      .catch(() => ({ bytes: undefined, failed: true })),
  ]);
  const result = await renderInWorker(character, context, {
    template,
    font,
    portrait: portrait.bytes,
  });
  const blob = new Blob([Uint8Array.from(result.bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = characterPdfFilename(character.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // A delayed revocation also gives mobile browsers time to consume the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return {
    pageCount: result.pageCount,
    warnings: [
      ...(portrait.failed ? ['O retrato não pôde ser incluído.'] : []),
      ...result.warnings,
    ],
  };
}
