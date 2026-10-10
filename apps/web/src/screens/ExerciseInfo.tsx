import type { Exercise } from '@fitapp/domain';
import { Icon, Sheet } from '../ui';

/** "How to do it": technique, nuances, typical mistakes and what to watch. Used by the workout, the program preview and the catalog. */
export function ExerciseInfoSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  if (!exercise) return null;
  const t = exercise.technique;
  const variants = exercise.variants.filter((v) => v.note);
  return (
    <Sheet open title={exercise.name} onClose={onClose}>
      <div className="stack exinfo">
        {!t && <p className="note">Описание техники для этого упражнения не добавлено. Короткие подсказки: {exercise.cues.join('; ') || 'нет'}.</p>}
        {t && (
          <>
            <section>
              <h3 className="t-h3">Как выполнять</h3>
              <ol className="exinfo-steps">{t.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </section>
            <section>
              <h3 className="t-h3">Нюансы</h3>
              <ul className="exinfo-list">{t.nuances.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section>
              <h3 className="t-h3">Частые ошибки</h3>
              <ul className="exinfo-list bad">{t.mistakes.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section>
              <h3 className="t-h3">На что обратить внимание</h3>
              <ul className="exinfo-list">{t.focus.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          </>
        )}
        {variants.length > 0 && (
          <section>
            <h3 className="t-h3">Варианты и хваты</h3>
            <ul className="exinfo-list">{variants.map((v) => <li key={v.key}><b>{v.label}.</b> {v.note}</li>)}</ul>
          </section>
        )}
        {exercise.painSensitiveAreas.length > 0 && (
          <section>
            <h3 className="t-h3"><Icon name="alert" size={16} /> Осторожно</h3>
            <ul className="exinfo-list">{exercise.painSensitiveAreas.map((p, i) => <li key={i}>{p.note}</li>)}</ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
