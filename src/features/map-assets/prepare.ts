import { validateImage } from '@/services/storage';
import type { MapAssetKind } from './types';
export async function prepareAssetImage(file: File, kind: MapAssetKind) {
  validateImage(file);
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Imagem inválida.');
    const make = (side: number, quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        const factor = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
        const c = canvas.getContext('2d');
        if (!c) return reject(new Error('Não foi possível preparar a imagem.'));
        c.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('Reduza o tamanho da imagem para até 5 MB.')),
          'image/webp',
          quality,
        );
      });
    let [full, thumbnail] = await Promise.all([
      make(kind === 'background' ? 4096 : 512, 0.9),
      make(256, 0.8),
    ]);
    if (full.size > 3 * 1024 * 1024) full = await make(kind === 'background' ? 2048 : 512, 0.75);
    if (full.size > 3 * 1024 * 1024 || thumbnail.size > 300 * 1024)
      throw new Error('Reduza os detalhes da imagem antes de enviá-la.');
    return { full, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
  }
}
