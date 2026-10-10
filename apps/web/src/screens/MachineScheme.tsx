import type { ReactNode } from 'react';

/**
 * Schematic side views of machines: the frame, the person at the start (dashed) and at the end (solid) of the movement,
 * an arrow for the direction and the working muscles tinted. They are drawings of the idea, not a photo of any brand.
 */
interface Scheme {
  title: string;
  muscles: string;
  caption: string;
  draw: () => ReactNode;
}

const FRAME = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none', opacity: 0.55 };
const BODY = { stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const GHOST = { ...BODY, strokeDasharray: '2 7', opacity: 0.45 };
const MUSCLE = { fill: 'var(--accent)', opacity: 0.85 };
const ARROW = { stroke: 'var(--primary)', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

const SCHEMES: Record<string, Scheme> = {
  lat_pulldown: {
    title: 'Верхний блок',
    muscles: 'Широчайшие, бицепс, середина спины',
    caption: 'Сядь, зафиксируй бёдра под валиками. Тяни рукоять к верху груди, локти вниз и к бокам. Пунктир: начало, сплошная линия: конец.',
    draw: () => (
      <>
        {/* frame: post, top beam, pulley, seat, thigh pads */}
        <path {...FRAME} d="M228 190V22H150" />
        <circle cx="150" cy="22" r="6" {...FRAME} />
        <path {...FRAME} d="M96 150H176M168 190V150" />
        <path {...FRAME} d="M160 134l30 4" strokeWidth={6} />
        {/* working muscle: lats */}
        <ellipse cx="122" cy="112" rx="11" ry="24" transform="rotate(-6 122 112)" {...MUSCLE} />
        {/* start (ghost): arms up */}
        <path {...GHOST} d="M140 90L118 56M118 56L112 38" />
        <path {...GHOST} d="M96 38H128" strokeWidth={7} />
        {/* cable, bar at the end of the movement */}
        <path {...FRAME} d="M150 28V74" />
        {/* person */}
        <circle cx="140" cy="62" r="10" fill="currentColor" opacity="0.9" />
        <path {...BODY} d="M140 88L134 150M134 150L176 148M176 148L180 188" />
        {/* end: elbows down, bar at the chest */}
        <path {...BODY} d="M140 90L118 120M118 120L108 100" />
        <path {...BODY} d="M92 100H126" stroke="var(--primary)" strokeWidth={7} />
        <path {...ARROW} d="M64 40V96M64 96l-7-9M64 96l7-9" />
      </>
    ),
  },
  leg_press: {
    title: 'Жим ногами',
    muscles: 'Квадрицепсы, ягодицы, задняя поверхность бедра',
    caption: 'Спина и таз прижаты к спинке. Стопы на середине платформы. Опускай до комфортного сгибания и выжимай платформу, не выпрямляя колени «в замок».',
    draw: () => (
      <>
        {/* frame: inclined rails, backrest, seat */}
        <path {...FRAME} d="M40 186L252 80" />
        <path {...FRAME} d="M52 172L52 112L88 92" strokeWidth={6} />
        {/* working muscle: quads */}
        <ellipse cx="136" cy="128" rx="28" ry="9" transform="rotate(-36 136 128)" {...MUSCLE} />
        {/* start (ghost): knees bent, platform near */}
        <path {...GHOST} d="M84 136L128 100L116 142" />
        <path {...GHOST} d="M104 150L134 78" strokeWidth={10} />
        {/* person: legs extended, platform far */}
        <circle cx="62" cy="96" r="10" fill="currentColor" opacity="0.9" />
        <path {...BODY} d="M68 108L84 138M84 138L158 104M158 104L214 80" />
        {/* platform at the end */}
        <path {...BODY} d="M204 56L228 108" stroke="var(--primary)" strokeWidth={9} />
        <path {...ARROW} d="M140 160L196 130M196 130l-11 0M196 130l-4 -10" />
      </>
    ),
  },
};

/** Equipment keys that have a drawing. */
export function schemeKeyFor(equipmentRequirements: readonly (readonly string[])[]): string | null {
  for (const group of equipmentRequirements) for (const k of group) if (SCHEMES[k]) return k;
  return null;
}

export function MachineScheme({ schemeKey }: { schemeKey: string }) {
  const s = SCHEMES[schemeKey];
  if (!s) return null;
  return (
    <section className="machine-scheme">
      <h3 className="t-h3">Схема: {s.title.toLowerCase()}</h3>
      <svg viewBox="0 0 280 200" role="img" aria-label={`Схема тренажёра: ${s.title}. Работают: ${s.muscles}`}>{s.draw()}</svg>
      <p className="t-small"><b>Работают:</b> {s.muscles}.</p>
      <p className="t-small">{s.caption}</p>
    </section>
  );
}
