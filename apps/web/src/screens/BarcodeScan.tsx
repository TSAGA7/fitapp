import { useEffect, useRef, useState } from 'react';
import { Button, TextField } from '../ui';
import { isBarcode } from '../app/openFoodFacts';

/** Camera scanner (ZXing is loaded only when the scanner opens, so the app itself stays small) with a manual fallback. */
export function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const done = useRef(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current as HTMLVideoElement, (result) => {
          const text = result?.getText();
          if (text && isBarcode(text) && !done.current) {
            done.current = true;
            onCode(text);
          }
        });
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        setProblem('Камера недоступна. Разреши доступ к камере для приложения в настройках телефона или введи цифры штрих-кода вручную.');
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onCode]);

  return (
    <div className="stack">
      {problem ? (
        <div className="note">{problem}</div>
      ) : (
        <div className="scan-box">
          <video ref={video} className="scan-video" playsInline muted autoPlay aria-label="Камера для штрих-кода" />
          <div className="scan-line" aria-hidden="true" />
        </div>
      )}
      {!problem && <p className="t-small">Наведи камеру на штрих-код на упаковке, держи ровно и при хорошем свете.</p>}
      <TextField label="Или введи цифры штрих-кода" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
      <div className="row">
        <Button variant="text" onClick={onCancel}>Назад</Button>
        <Button disabled={!isBarcode(typed)} onClick={() => onCode(typed)}>Найти</Button>
      </div>
    </div>
  );
}
