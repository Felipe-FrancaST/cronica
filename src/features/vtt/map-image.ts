/** Map uploads may be large; the private bucket deliberately stays limited to 5 MB. */
export function validateMapImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 25 * 1024 * 1024)
    throw new Error('O mapa deve ter no máximo 25 MB antes da otimização.');
}

export async function prepareMapImage(file: File): Promise<File> {
  validateMapImage(file);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(
      'Não foi possível ler esta imagem. Exporte o mapa novamente como JPG, PNG ou WebP.',
    );
  });
  try {
    if (bitmap.width <= 4096 && bitmap.height <= 4096 && file.size <= 5 * 1024 * 1024) return file;
    const ratio = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu otimizar a imagem.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.72, 0.52]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      );
      if (blob && blob.size <= 5 * 1024 * 1024)
        return new File([blob], 'mapa.webp', { type: blob.type });
    }
    throw new Error('A imagem ainda ultrapassa 5 MB. Reduza a resolução e tente novamente.');
  } finally {
    bitmap.close();
  }
}
