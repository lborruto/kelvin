export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

let seq = 0;

class Toasts {
  items = $state<Toast[]>([]);

  push(message: string, kind: Toast['kind'] = 'error', ttlMs = 6000): void {
    const id = ++seq;
    this.items = [...this.items, { id, message, kind }];
    setTimeout(() => this.remove(id), ttlMs);
  }

  remove(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
