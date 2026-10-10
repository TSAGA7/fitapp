import type { BackupService } from '@fitapp/domain';

export type BackupSaveResult = 'saved' | 'cancelled';

/**
 * Hands the user a backup file. On a phone it opens the system share sheet ("Save to Files" is one of its options),
 * elsewhere it downloads the file. The backup is recorded as done only when the user did not cancel.
 */
export async function saveBackupFile(backup: BackupService): Promise<BackupSaveResult> {
  const json = await backup.exportJson({ record: false });
  const name = `fitapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Копия Fitapp' });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // sharing is not possible here after all: fall back to a plain download
      download(json, name);
    }
  } else {
    download(json, name);
  }
  await backup.recordBackup();
  return 'saved';
}

function download(json: string, name: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
