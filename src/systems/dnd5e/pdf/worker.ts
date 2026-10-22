import { generateCharacterPdf, type CharacterPdfAssets } from './generate';
import type { CharacterPdfContext } from './model';
import type { Character } from '@/types';

export interface CharacterPdfJob {
  character: Character;
  context: CharacterPdfContext;
  assets: CharacterPdfAssets;
}
export type CharacterPdfResult =
  | { ok: true; bytes: Uint8Array; pageCount: number; warnings: string[] }
  | { ok: false; error: string };

globalThis.onmessage = async (event: MessageEvent<CharacterPdfJob>) => {
  try {
    const result = await generateCharacterPdf(
      event.data.character,
      event.data.context,
      event.data.assets,
    );
    globalThis.postMessage(
      {
        ok: true,
        bytes: result.bytes,
        pageCount: result.pageCount,
        warnings: result.warnings,
      } satisfies CharacterPdfResult,
      { transfer: [result.bytes.buffer] },
    );
  } catch (error) {
    globalThis.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível gerar a ficha PDF.',
    } satisfies CharacterPdfResult);
  }
};
