import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BodyLimitError, readBoundedBody } from '@/lib/bounded-body';
import { withRequestDeadline } from '@/lib/async-operation';

const inputSchema = z
  .object({
    character: z
      .object({
        id: z.string().uuid(),
        campaign_id: z.string().uuid(),
        owner_id: z.string().uuid(),
        rpg_system_id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        sheet: z.object({ system: z.literal('arkanis') }).passthrough(),
      })
      .passthrough(),
    expected: z.string().min(1).max(80).nullable(),
  })
  .strict();
class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
export function characterSaveHandler(
  createClient: (signal: AbortSignal) => Promise<SupabaseClient>,
  timeout = 25_000,
  configuredOrigin?: string,
) {
  return async (request: Request): Promise<Response> => {
    const reference = crypto.randomUUID();
    let stage = 'entrada';
    const started = Date.now();
    const respond = (body: object, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Request-Id': reference,
          'Server-Timing': `save;dur=${Date.now() - started}`,
        },
      });
    try {
      if (request.headers.get('origin') !== new URL(configuredOrigin || request.url).origin)
        throw new SaveError('Abra a ficha pelo próprio site para salvar.', 403, 'origem');
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
        throw new SaveError('Formato de salvamento inválido.', 415, 'formato');
      const data = await withRequestDeadline(
        async (deadline) => {
          const signal = AbortSignal.any([deadline, request.signal]);
          const input = inputSchema.parse(
            JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 2 * 1024 * 1024))),
          );
          signal.throwIfAborted();
          stage = 'sessao';
          const client = await createClient(signal);
          const auth = await client.auth.getUser();
          signal.throwIfAborted();
          if (auth.error || !auth.data.user)
            throw new SaveError(
              'Sua sessão não pôde ser confirmada. Entre novamente; seu rascunho foi mantido.',
              401,
              'sessao',
            );
          stage = 'banco';
          // The user's cookie session is forwarded. RLS and the checked SQL function remain authoritative.
          const result = await client
            .rpc('save_arkanis_character', {
              p_payload: input.character,
              p_expected_updated_at: input.expected,
            })
            .abortSignal(signal);
          signal.throwIfAborted();
          if (result.error) {
            const code = result.error.code || 'resposta_banco';
            throw new SaveError(
              result.error.message,
              code === '42501' ? 403 : code === '40001' ? 409 : code === 'PGRST202' ? 503 : 422,
              code,
            );
          }
          if (
            !result.data ||
            result.data.id !== input.character.id ||
            typeof result.data.updated_at !== 'string'
          )
            throw new SaveError(
              'O banco não confirmou a versão da ficha. Reabra para conferir antes de tentar novamente.',
              502,
              'confirmacao',
            );
          return { id: result.data.id, updated_at: result.data.updated_at };
        },
        'Prazo de resposta excedido.',
        timeout,
      );
      return respond({ ...data, reference });
    } catch (error) {
      const known = error instanceof SaveError;
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
      const limit = error instanceof BodyLimitError;
      const code = known
        ? error.code
        : invalid
          ? 'dados_invalidos'
          : limit
            ? 'tamanho'
            : `sem_resposta_${stage}`;
      const message = known
        ? error.message
        : invalid
          ? 'Confira os dados da ficha antes de salvar.'
          : limit
            ? error.message
            : `Não foi possível confirmar o salvamento na etapa ${stage === 'sessao' ? 'de sessão' : stage === 'banco' ? 'do banco' : 'de envio'}. Seu rascunho foi mantido. Reabra a ficha para conferir antes de tentar novamente.`;
      // Never log the sheet, cookies, user identifier or credentials.
      console.warn('[character-save]', {
        reference,
        stage,
        code,
        elapsed_ms: Date.now() - started,
      });
      return respond(
        { error: message, code, stage, reference },
        known ? error.status : invalid ? 400 : limit ? 413 : 504,
      );
    }
  };
}
