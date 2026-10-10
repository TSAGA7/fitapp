import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/** A render crash must never leave a blank screen: show the reason and a way out. Data is not touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ padding: '48px 20px', fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Что-то пошло не так</h1>
        <p style={{ margin: '0 0 16px', lineHeight: 1.4 }}>Данные на телефоне целы. Нажми «Перезапустить»: если не поможет, пришли разработчику текст ниже.</p>
        <button
          type="button"
          onClick={() => {
            const done = () => location.reload();
            const reset = window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : Promise.resolve([]);
            void reset.then(done, done);
          }}
          style={{ padding: '14px 20px', borderRadius: 14, border: 0, background: '#065F46', color: '#fff', fontSize: 16 }}
        >
          Перезапустить
        </button>
        <pre style={{ marginTop: 20, whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.7 }}>{String(this.state.error.stack ?? this.state.error.message).slice(0, 600)}</pre>
      </main>
    );
  }
}
