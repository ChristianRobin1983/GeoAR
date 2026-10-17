/** Minimal typed event emitter. */
export class Emitter<Events> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    (this.listeners[event] ??= new Set()).add(fn);
    return () => this.listeners[event]?.delete(fn);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[Emitter] listener for "${String(event)}" failed`, err);
      }
    });
  }
}
