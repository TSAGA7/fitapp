import { useMemo, useState } from 'react';
import type { Exercise, MuscleGroup } from '@fitapp/domain';
import { assessExercise, isBodyweightOnly } from '@fitapp/domain';
import { setExercisePreference } from '../actions';
import { useData } from '../app/DataContext';
import { safetyContext } from '../app/derive';
import { Chip, TextField } from '../ui';
import { ScreenHeader } from './shared';
import { useCommand } from '../app/useCommand';

type Filter = 'all' | 'like' | 'dislike' | 'core' | 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'bodyweight';
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'like', label: 'Нравятся' },
  { value: 'dislike', label: 'Не нравятся' },
  { value: 'core', label: 'Пресс' },
  { value: 'legs', label: 'Ноги и ягодицы' },
  { value: 'chest', label: 'Грудь' },
  { value: 'back', label: 'Спина' },
  { value: 'shoulders', label: 'Плечи' },
  { value: 'arms', label: 'Руки' },
  { value: 'bodyweight', label: 'Со своим весом' },
];
const GROUPS: Record<Exclude<Filter, 'all' | 'like' | 'dislike' | 'bodyweight'>, readonly MuscleGroup[]> = {
  core: ['abs', 'obliques'],
  legs: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'],
  chest: ['chest'],
  back: ['lats', 'upper_back', 'lower_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  arms: ['biceps', 'triceps', 'forearms'],
};

export function ExerciseCatalogScreen() {
  const { snapshot: s } = useData();
  const { ok, banner } = useCommand();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const pref = useMemo(() => new Map(s.userExercises.filter((u) => u.deletedAt === null).map((u) => [u.exerciseId, u.preference])), [s.userExercises]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.exercises
      .filter((e) => e.deletedAt === null)
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
      .filter((e: Exercise) => {
        if (filter === 'all') return true;
        if (filter === 'like' || filter === 'dislike') return pref.get(e.id) === filter;
        if (filter === 'bodyweight') return isBodyweightOnly(e);
        return e.primaryMuscles.some((m) => GROUPS[filter].includes(m));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [s.exercises, filter, query, pref]);

  const removedByPain = useMemo(() => {
    const ctx = safetyContext(s, new Date().toISOString());
    const noLikes = { ...ctx, liked: new Set<string>() };
    return new Set(s.exercises.filter((e) => e.deletedAt === null && assessExercise(e, noLikes).status === 'avoid').map((e) => e.id));
  }, [s]);
  const set = (e: Exercise, v: 'like' | 'dislike') => void ok((d) => setExercisePreference(d, e.id, pref.get(e.id) === v ? null : v));

  return (
    <main className="screen">
      <ScreenHeader title="Каталог упражнений" back="profile" />
      <p className="note">Отметь, какие упражнения тебе удобны, а какие нет. «Нравится» чаще попадает в программу и в замены, Если упражнение убрано из программы из‑за болевой точки, «Нравится» вернёт его (с осторожностью). «Не нравится» не попадает в новую программу и стоит в конце списка замен.</p>
      {banner}
      <TextField label="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" role="group" aria-label="Фильтр">
        {FILTERS.map((f) => <Chip key={f.value} pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
      </div>
      <div className="list">
        {items.map((e) => (
          <div key={e.id} className="list-item ex-row">
            <div>
              <div className="li-title">{e.name}</div>
              <div className="li-sub">{isBodyweightOnly(e) ? 'Без оборудования' : e.equipmentRequirements.length ? 'Нужно оборудование' : ''} · {e.defaultSets}×{e.defaultRepRange.min}–{e.defaultRepRange.max}{e.loadUnit === 'seconds' ? ' с' : ''}</div>
              {removedByPain.has(e.id) && <div className="li-sub" style={{ color: 'var(--danger)' }}>{pref.get(e.id) === 'like' ? 'Возвращено лайком: выполняй осторожно' : 'Убрано из программы из‑за болевой точки. «Нравится» вернёт его'}</div>}
            </div>
            <div className="chips">
              <Chip pressed={pref.get(e.id) === 'like'} onClick={() => set(e, 'like')}>Нравится</Chip>
              <Chip pressed={pref.get(e.id) === 'dislike'} onClick={() => set(e, 'dislike')}>Не нравится</Chip>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="empty-hint"><span className="eh-ic" aria-hidden="true">🔍</span><span className="eh-t">Ничего не найдено</span><span className="eh-s">Попробуй другой фильтр или поиск</span></div>}
      </div>
    </main>
  );
}
