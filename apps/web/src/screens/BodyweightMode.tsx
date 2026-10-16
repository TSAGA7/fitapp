import { useMemo, useState } from 'react';
import { startBodyweightWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { bodyweightPlan, exerciseName } from '../app/derive';
import { setBodyweightMode, setHomeEquipment, setOwnMode, useBodyweightMode, useHomeEquipment, useOwnMode } from '../app/prefs';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, Chip, Segmented } from '../ui';

/** What a person may have at home: the gym-only machines are not offered. */
const HOME_CHOICES = ['dumbbells', 'kettlebell', 'resistance_band', 'pullup_bar', 'flat_bench', 'adjustable_bench', 'barbell', 'dip_station'] as const;
const HOME_LABEL: Record<string, string> = { dumbbells: 'Гантели', kettlebell: 'Гиря', resistance_band: 'Резинки', pullup_bar: 'Турник', flat_bench: 'Скамья', adjustable_bench: 'Скамья регулируемая', barbell: 'Штанга', dip_station: 'Брусья' };

/**
 * How the person trains now: «Зал» (the program), «Дом» (a workout made from what is at home)
 * or «Своя» (a plain journal: exercises and sets are added by hand). The program itself is never changed.
 */
export function PlaceSwitch() {
  const home = useBodyweightMode();
  const own = useOwnMode();
  const pick = (v: 'gym' | 'home' | 'own') => {
    if (v === 'own') setOwnMode(true);
    else if (v === 'home') setBodyweightMode(true);
    else {
      setOwnMode(false);
      setBodyweightMode(false);
    }
  };
  return <Segmented<'gym' | 'home' | 'own'> label="Как тренируешься" value={own ? 'own' : home ? 'home' : 'gym'} onChange={pick} options={[{ value: 'gym', label: 'Зал' }, { value: 'home', label: 'Дом' }, { value: 'own', label: 'Своя' }]} />;
}

/** The workout of the day at home: replaces the program workout while «Дом» is on. */
export function BodyweightCard() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const have = useHomeEquipment();
  const [editing, setEditing] = useState(false);
  const plan = useMemo(() => bodyweightPlan(s, `${s.today}T12:00:00.000Z`, have), [s, have]);
  const open = s.openSession;
  const toggle = (k: string) => setHomeEquipment(have.includes(k) ? have.filter((x) => x !== k) : [...have, k]);
  const summary = have.length === 0 ? 'только свой вес' : have.map((k) => HOME_LABEL[k] ?? k).join(', ');
  return (
    <Card>
      <div className="stack">
        <div className="row between">
          <div className="t-caption">Режим «Дом»</div>
          <Button size="sm" variant="text" onClick={() => setBodyweightMode(false)}>Вернуться в зал</Button>
        </div>
        <div className="t-h3">Тренировка дома</div>
        <p className="t-small">Программа зала на паузе: когда вернёшься, останется ровно та тренировка, что была запланирована. Вес и прогрессия по основной программе не меняются.</p>
        <div className="row between">
          <p className="t-small grow">Дома есть: <b>{summary}</b></p>
          <Button size="sm" variant="text" onClick={() => setEditing(!editing)}>{editing ? 'Готово' : 'Изменить'}</Button>
        </div>
        {editing && (
          <div className="stack tight">
            <div className="chips" role="group" aria-label="Оборудование дома">
              {HOME_CHOICES.map((k) => <Chip key={k} pressed={have.includes(k)} onClick={() => toggle(k)}>{HOME_LABEL[k]}</Chip>)}
            </div>
            <p className="t-small">Коврик считается всегда. У резинок есть три уровня упругости: в тренировке выбираешь лёгкую, среднюю или тяжёлую, и у каждой своя история прогресса.</p>
          </div>
        )}
        <ol className="t-body">
          {plan.exercises.map((e) => <li key={e.key}>{exerciseName(s.exercises, e.exerciseId)}</li>)}
        </ol>
        {banner}
        {open ? (
          <Button icon="play" onClick={() => go(`workout/${open.id}`)}>Продолжить начатую тренировку</Button>
        ) : (
          <Button icon="play" disabled={busy || plan.exercises.length === 0} onClick={async () => { const id = await run((d) => startBodyweightWorkout(d, have)); if (id) go(`workout/${id}`); }}>Начать</Button>
        )}
      </div>
    </Card>
  );
}
