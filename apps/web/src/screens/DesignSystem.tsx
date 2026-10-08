import { useState } from 'react';
import { addDays } from '@fitapp/domain';
import { Badge, Button, Card, Chip, EmptyState, Icon, IconButton, LineChart, ListItem, MetricCard, ProgressBar, ProgressRing, Segmented, SelectField, Sheet, Sparkline, TextField } from '../ui';

const COLORS: ReadonlyArray<[string, string]> = [
  ['Primary', '#065F46'],
  ['Accent', '#A3E635'],
  ['Background', '#F7F8FA'],
  ['Surface', '#FFFFFF'],
  ['Text', '#0F172A'],
  ['Muted', '#64748B'],
  ['Success', '#16A34A'],
  ['Warning', '#F59E0B'],
  ['Danger', '#EF4444'],
];

/** Living style guide at #/design: every component of the design system in one place. */
export function DesignSystem() {
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('day');
  const [chip, setChip] = useState(true);
  const [open, setOpen] = useState(false);
  const points = [84, 83.6, 83.9, 83.1, 82.8, 82.9, 82.4, 82.2, 82.5].map((v, i) => ({ date: addDays('2026-09-10', i * 3), value: v }));
  return (
    <main className="screen no-nav" style={{ paddingBottom: 120 }}>
      <h1 className="t-h1">Design System</h1>
      <section className="ds-section"><h2 className="t-h3">Цвета</h2>
        <div className="swatches">{COLORS.map(([n, c]) => <div className="swatch" key={n}><i style={{ background: c }} />{n}<br />{c}</div>)}</div>
      </section>
      <section className="ds-section"><h2 className="t-h3">Типографика</h2>
        <Card><div className="t-h1">H1 32/40 Bold</div><div className="t-h2">H2 24/32 Semibold</div><div className="t-h3">H3 18/26 Semibold</div><div className="t-body">Body 16/24 Regular</div><div className="t-caption">Caption 14/20 Medium</div></Card>
      </section>
      <section className="ds-section"><h2 className="t-h3">Кнопки</h2>
        <Button block>Primary</Button><Button block variant="secondary">Secondary</Button><Button variant="text">Text</Button>
        <div className="row"><IconButton icon="heart" label="Иконка" /><Badge>Активно</Badge><Badge tone="warning">Скоро</Badge><Badge tone="danger">Ошибка</Badge></div>
      </section>
      <section className="ds-section"><h2 className="t-h3">Поля</h2>
        <TextField label="Input" placeholder="Введите текст" />
        <TextField label="С единицей" unit="кг" placeholder="82,5" />
        <TextField label="С ошибкой" error="Проверь значение" defaultValue="abc" />
        <SelectField label="Select"><option>Выберите</option><option>Вариант</option></SelectField>
        <Segmented label="Период" value={seg} onChange={setSeg} options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
        <div className="chips"><Chip pressed={chip} onClick={() => setChip(!chip)}>Пн</Chip><Chip pressed={!chip} onClick={() => setChip(!chip)}>Вт</Chip></div>
      </section>
      <section className="ds-section"><h2 className="t-h3">Карточки и списки</h2>
        <Card onClick={() => undefined}><div className="li-title">Заголовок</div><div className="li-sub">Описание карточки</div></Card>
        <div className="grid-2"><MetricCard icon="scale" label="Вес" value="82,5 кг" delta="−1,8 кг · 30 дней" tone="good" tint /><MetricCard icon="ruler" label="Грудь" value="102 см" delta="+1 см" tone="bad" tint /></div>
        <ListItem icon="gear" title="Настройки" onClick={() => undefined} />
        <ProgressBar value={0.72} label="72%" />
        <div className="row"><ProgressRing value={0.65} size={96} stroke={10}><strong>1 240</strong></ProgressRing><div style={{ width: 140 }}><Sparkline values={[5, 4, 4.5, 3, 3.2, 2]} /></div></div>
        <Card><LineChart ariaLabel="Пример графика" series={[{ id: 'a', label: 'Вес', color: '#16a34a', area: true, dots: true, points }]} height={180} formatY={(v) => String(Math.round(v))} formatX={(d) => d.slice(5)} /></Card>
        <Card flat><EmptyState icon="training" title="Пустое состояние" text="Подсказка о том, что делать дальше." action={<Button size="sm" onClick={() => setOpen(true)}>Открыть шторку</Button>} /></Card>
      </section>
      <Sheet open={open} title="Шторка" onClose={() => setOpen(false)}><p className="note">Нижняя шторка для коротких форм.</p></Sheet>
      <section className="ds-section"><h2 className="t-h3">Нижняя навигация</h2><div style={{ position: 'relative', height: 76 }}><div style={{ position: 'absolute', inset: 0, display: 'grid' }}><BottomNavStatic /></div></div></section>
    </main>
  );
}

function BottomNavStatic() {
  return (
    <div style={{ transform: 'scale(1)', pointerEvents: 'none' }}>
      <div style={{ position: 'relative' }}>
        <div className="bottom-nav" style={{ position: 'static', transform: 'none', width: '100%' }}>
          <BottomNavItems />
        </div>
      </div>
    </div>
  );
}
function BottomNavItems() {
  return (
    <>
      {(['today', 'nutrition', 'training', 'progress', 'profile'] as const).map((k, i) => (
        <a key={k} href="#/design" aria-current={i === 0 ? 'page' : undefined}>
          <span className="nav-ic"><Icon name={k} size={22} /></span>
          {['Сегодня', 'Питание', 'Тренировки', 'Прогресс', 'Профиль'][i]}
        </a>
      ))}
    </>
  );
}
