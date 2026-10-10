import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useWeightUnit } from './app/prefs';
import { getAppRuntime, type AppRuntime } from './composition';
import { DataProvider, useData } from './app/DataContext';
import { useRoute } from './app/router';
import { BottomNav, Button, Sheet } from './ui';
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
            <UnitRoot><Gate /></UnitRoot>
          </DataProvider>
        )}
      </div>
    </div>
  );
}

/** Changing the weight unit re-draws everything with the new unit. */
function UnitRoot({ children }: { children: ReactNode }) {
  const unit = useWeightUnit();
  return <Fragment key={unit}>{children}</Fragment>;
}

const BDAY_KEY = 'fitapp.birthdayShown';

/** Shows the birthday greeting once per year, on the first launch that day. */
function BirthdayGreeting({ birthDate }: { birthDate: string }) {
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isBirthday = birthDate.slice(5) === ymd.slice(5);
  const [open, setOpen] = useState(() => {
    if (!isBirthday) return false;
    try { return localStorage.getItem(BDAY_KEY) !== ymd; } catch { return true; }
  });
  const close = () => {
    try { localStorage.setItem(BDAY_KEY, ymd); } catch { /* storage may be unavailable */ }
    setOpen(false);
  };
  if (!isBirthday) return null;
  return (
    <Sheet open={open} title="🎂 С днём рождения!" onClose={close}>
      <p className="t-body">С др! Ты давай тоже особо не напрягайся в этот день, закрывай приложение!</p>
      <Button onClick={close}>Ладно</Button>
    </Sheet>
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
      <BirthdayGreeting birthDate={snapshot.profile.birthDate} />
      {tab === 'today' && <Today />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'training' && <Training />}
      {tab === 'progress' && <Progress route={route} />}
      {tab === 'profile' && <Profile route={route} />}
      <BottomNav current={tab} />
    </>
  );
}
