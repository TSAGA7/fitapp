import { useState } from 'react';
import { CHANGELOG, markChangelogSeen, markChangelogSeenIfNew, unseenChangelog, type ChangelogEntry } from '../app/changelog';
import { formatDateLong } from '../app/format';
import { Button, Sheet } from '../ui';

function Bullets({ entries }: { entries: readonly ChangelogEntry[] }) {
  return (
    <ul className="whats-new">
      {entries.flatMap((e) => e.items.map((t) => <li key={`${e.id}-${t}`}>{t}</li>))}
    </ul>
  );
}

/** Once after an update: what changed, in short points. A fresh install shows nothing. */
export function WhatsNewOnUpdate({ fresh }: { fresh: boolean }) {
  const [entries] = useState(() => {
    if (fresh) {
      markChangelogSeenIfNew();
      return [];
    }
    return unseenChangelog();
  });
  const [open, setOpen] = useState(entries.length > 0);
  const close = () => {
    markChangelogSeen();
    setOpen(false);
  };
  if (entries.length === 0) return null;
  return (
    <Sheet open={open} title="Что нового" onClose={close}>
      <div className="stack">
        <Bullets entries={entries} />
        <Button block onClick={close}>Понятно</Button>
      </div>
    </Sheet>
  );
}

/** All releases, newest first (Настройки → «Что нового»). */
export function ChangelogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dates = [...new Set(CHANGELOG.map((e) => e.date))];
  return (
    <Sheet open={open} title="Что нового" onClose={onClose}>
      <div className="stack">
        {dates.map((d) => (
          <div key={d} className="stack tight">
            <div className="t-caption">{formatDateLong(d)}</div>
            <Bullets entries={CHANGELOG.filter((e) => e.date === d)} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
