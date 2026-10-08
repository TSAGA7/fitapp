import { useEffect, useState } from 'react';
import { getAppRuntime, type AppRuntime } from './composition';
import { DataProvider, useData } from './app/DataContext';
import { useRoute } from './app/router';
import { BottomNav } from './ui';
import { DesignSystem } from './screens/DesignSystem';
import { Nutrition } from './screens/Nutrition';
import { Onboarding } from './screens/Onboarding';
import { Profile } from './screens/Profile';
import { Progress } from './screens/Progress';
import { Today } from './screens/Today';
import { Training } from './screens/Training';
import { Workout } from './screens/Workout';

/** Application shell: opens the local database, shows onboarding on the first launch, then the five tabs. */
export function App({ runtime }: { runtime?: Promise<AppRuntime> }) {
  const [rt, setRt] = useState<AppRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (runtime ?? getAppRuntime()).then(setRt, (e: Error) => setError(e.message));
  }, [runtime]);

  return (
    <div className="app-shell">
      <div className="app-frame">
        {error && <div className="screen"><div className="errbox" role="alert">{error}</div></div>}
        {!rt && !error && <div className="screen" aria-busy="true"><p className="note">Открываю базу данных…</p></div>}
        {rt && (
          <DataProvider runtime={rt}>
            <Gate />
          </DataProvider>
        )}
      </div>
    </div>
  );
}

function Gate() {
  const { snapshot } = useData();
  const route = useRoute();
  if (route[0] === 'design') return <DesignSystem />;
  if (!snapshot.profile) return <Onboarding />;
  if (route[0] === 'workout' && route[1]) return <Workout key={route[1]} sessionId={route[1]} />;
  const tab = ['today', 'nutrition', 'training', 'progress', 'profile'].includes(route[0] as string) ? (route[0] as string) : 'today';
  return (
    <>
      {tab === 'today' && <Today />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'training' && <Training />}
      {tab === 'progress' && <Progress route={route} />}
      {tab === 'profile' && <Profile route={route} />}
      <BottomNav current={tab} />
    </>
  );
}
