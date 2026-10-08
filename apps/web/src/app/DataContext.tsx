import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppDeps } from '@fitapp/application';
import type { AppRuntime } from '../composition';
import { loadSnapshot, type Snapshot } from './snapshot';

interface DataValue {
  runtime: AppRuntime;
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  /** Runs a command and then reloads what the screens show. */
  act: <T>(command: (deps: AppDeps) => Promise<T>) => Promise<T>;
}

const Ctx = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}

export function DataProvider({ runtime, children }: { runtime: AppRuntime; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await loadSnapshot(runtime.deps));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async <T,>(command: (deps: AppDeps) => Promise<T>): Promise<T> => {
      const result = await command(runtime.deps);
      await refresh();
      return result;
    },
    [runtime, refresh],
  );

  if (error) return <div className="screen"><div className="errbox">{error}</div></div>;
  if (!snapshot) return <div className="screen" aria-busy="true"><p className="note">Открываю данные…</p></div>;
  return <Ctx.Provider value={{ runtime, snapshot, refresh, act }}>{children}</Ctx.Provider>;
}
