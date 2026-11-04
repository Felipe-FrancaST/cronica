'use client';
import { Button } from './ui';
export function DraftRecovery({
  draft,
}: {
  draft: {
    recovery: unknown;
    warning: string | null;
    recover(): void;
    clear(): void;
  };
}) {
  return (
    <>
      {draft.recovery ? (
        <div className="panel" role="status">
          <p>Há um rascunho não concluído deste registro.</p>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={draft.recover}>
              Recuperar rascunho
            </Button>
            <Button type="button" variant="ghost" onClick={draft.clear}>
              Descartar rascunho
            </Button>
          </div>
        </div>
      ) : null}
      {draft.warning ? <p role="status">{draft.warning}</p> : null}
    </>
  );
}
