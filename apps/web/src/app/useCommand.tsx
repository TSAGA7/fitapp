import { useCallback, useState } from 'react';
import type { AppDeps } from '@fitapp/application';
import { useData } from './DataContext';

/** Runs a command through the data layer and keeps a human-readable error for the screen. */
export function useCommand() {
  const { act } = useData();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(command: (deps: AppDeps) => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await act(command);
        setError(null);
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [act],
  );
  /** Like run, but reports success explicitly (for commands returning void). */
  const ok = useCallback(
    async (command: (deps: AppDeps) => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await act(command);
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [act],
  );
  const banner = error ? (
    <div className="errbox" role="alert" onClick={() => setError(null)}>
      {error}
    </div>
  ) : null;
  return { run, ok, error, busy, banner, clear: () => setError(null) };
}
