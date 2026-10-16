import { useMemo, useState } from 'react';
import { assessExercise, isBodyweightOnly, type Exercise } from '@fitapp/domain';
import { useData } from '../app/DataContext';
import { safetyContext } from '../app/derive';
import { Chip, Icon, Sheet, TextField } from '../ui';
import { FILTERS, GROUPS, matchesQuery, tokens, type Filter } from './ExerciseCatalog';
import { ExerciseInfoSheet } from './ExerciseInfo';

/**
 * Picking an exercise from the catalog: search, muscle-group filters, and a mark for the ones that
 * do not suit the user's limits (they can still be taken: it is his own workout, the mark is a warning).
 * The sheet stays open after a pick, so several exercises can be added in a row; `added` counts them.
 */
export function ExercisePickerSheet({ open, title, added, onPick, onClose }: { open: boolean; title: string; added?: ReadonlyMap<string, number>; onPick: (exercise: Exercise) => void; onClose: () => void }) {
  const { snapshot: s } = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [info, setInfo] = useState<Exercise | null>(null);
  const pref = useMemo(() => new Map(s.userExercises.filter((u) => u.deletedAt === null).map((u) => [u.exerciseId, u.preference])), [s.userExercises]);
  const ctx = useMemo(() => safetyContext(s, new Date().toISOString()), [s]);
  const items = useMemo(() => {
    if (!open) return [];
    const q = tokens(query);
    return s.exercises
      .filter((e) => e.deletedAt === null)
      .filter((e) => matchesQuery(e.name, q))
      .filter((e: Exercise) => {
        if (filter === 'all') return true;
        if (filter === 'like' || filter === 'dislike') return pref.get(e.id) === filter;
        if (filter === 'bodyweight') return isBodyweightOnly(e);
        if (filter === 'band') return e.equipmentRequirements.some((g) => g.includes('resistance_band'));
        return e.primaryMuscles.some((m) => GROUPS[filter].includes(m));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((e) => ({ e, a: assessExercise(e, ctx) }));
  }, [open, s.exercises, filter, query, pref, ctx]);
  if (!open) return null;
  return (
    <Sheet open title={title} onClose={onClose}>
      <div className="stack">
        <TextField label="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Фильтр">
          {FILTERS.map((f) => <Chip key={f.value} pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</Chip>)}
        </div>
        <div className="list">
          {items.map(({ e, a }) => {
            const n = added?.get(e.id) ?? 0;
            const warn = a.status === 'avoid' ? 'Не подходит твоим ограничениям: только если уверен' : a.status === 'caution' ? 'Осторожно: следи за техникой' : a.status === 'unavailable' ? 'Нет оборудования в профиле' : '';
            return (
              <div key={e.id} className="list-item pick-row">
                <button type="button" className="pick-main" aria-label={`Добавить: ${e.name}`} onClick={() => onPick(e)}>
                  <span className="li-title">{e.name}</span>
                  <span className="li-sub">{e.defaultSets}×{e.defaultRepRange.min}–{e.defaultRepRange.max}{e.loadUnit === 'seconds' ? ' с' : ''}{pref.get(e.id) === 'like' ? ' · ❤️' : ''}</span>
                  {warn && <span className="li-sub" style={{ color: a.status === 'avoid' ? 'var(--danger)' : '#b45309' }}>{warn}</span>}
                </button>
                <button type="button" className="icon-btn" aria-label={`Техника: ${e.name}`} onClick={() => setInfo(e)}><Icon name="info" size={18} /></button>
                <button type="button" className={n > 0 ? 'pick-count' : 'pick-add'} aria-label={n > 0 ? `Добавлено ${n}. Добавить ещё: ${e.name}` : `Добавить: ${e.name}`} onClick={() => onPick(e)}>{n > 0 ? `✓${n > 1 ? ` ${n}` : ''}` : <Icon name="plus" size={20} />}</button>
              </div>
            );
          })}
          {items.length === 0 && <div className="empty-hint"><span className="eh-ic" aria-hidden="true">🔍</span><span className="eh-t">Ничего не найдено</span><span className="eh-s">Попробуй другой фильтр или поиск</span></div>}
        </div>
      </div>
      <ExerciseInfoSheet exercise={info} onClose={() => setInfo(null)} />
    </Sheet>
  );
}
