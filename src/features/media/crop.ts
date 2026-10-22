export interface CropState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const INITIAL_CROP: CropState = { x: 0.5, y: 0.5, zoom: 1, rotation: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function rotatedSize(width: number, height: number, rotation: number) {
  return Math.abs(rotation % 180) === 90 ? { width: height, height: width } : { width, height };
}
export function cropRectangle(
  width: number,
  height: number,
  aspect: number,
  state: CropState,
): CropRect {
  const size = rotatedSize(width, height, state.rotation);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : size.width / size.height;
  const zoom = clamp(state.zoom || 1, 1, 6);
  const w = Math.min(size.width, size.height * ratio) / zoom,
    h = w / ratio;
  return {
    x: clamp(state.x * size.width - w / 2, 0, size.width - w),
    y: clamp(state.y * size.height - h / 2, 0, size.height - h),
    width: w,
    height: h,
  };
}
export function constrainCrop(
  width: number,
  height: number,
  aspect: number,
  state: CropState,
): CropState {
  const r = cropRectangle(width, height, aspect, state),
    size = rotatedSize(width, height, state.rotation);
  return {
    ...state,
    x: (r.x + r.width / 2) / size.width,
    y: (r.y + r.height / 2) / size.height,
    zoom: clamp(state.zoom, 1, 6),
  };
}
export async function cropImageFile(
  image: HTMLImageElement,
  file: File,
  rect: CropRect,
  rotation: number,
  maxSide = 2048,
): Promise<File> {
  const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu ajustar a imagem.');
  ctx.scale(canvas.width / rect.width, canvas.height / rect.height);
  ctx.translate(-rect.x, -rect.y);
  const angle = ((rotation % 360) + 360) % 360;
  if (angle === 90) ctx.translate(image.naturalHeight, 0);
  if (angle === 180) ctx.translate(image.naturalWidth, image.naturalHeight);
  if (angle === 270) ctx.translate(0, image.naturalWidth);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(image, 0, 0);
  // WebP preserves transparent PNGs and keeps large covers inside the bucket limit.
  for (const quality of [0.92, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (blob && blob.size <= 5 * 1024 * 1024) {
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-ajustada.${ext}`, {
        type: blob.type,
      });
    }
  }
  throw new Error('A imagem ajustada ainda ultrapassa 5 MB. Aumente o recorte e tente novamente.');
}
