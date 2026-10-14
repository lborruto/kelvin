export type ThemeChoice = 'system' | 'dark' | 'light';
const KEY = 'kelvin-theme';

/** The browser chrome colour of each theme: its --bg token (app.css). */
export const THEME_COLORS = { dark: '#0f1115', light: '#f5f6f8' } as const;

/** Colour the browser chrome: a manual theme sets every theme-color meta to that theme;
 * "system" gives each meta its own prefers-color-scheme colour back. */
export function applyThemeColor(choice: ThemeChoice, doc: Document = document): void {
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = (meta.getAttribute('media') ?? '').includes('light') ? 'light' : 'dark';
    meta.content = THEME_COLORS[choice === 'system' ? own : choice];
  }
}

export const theme = {
  get(): ThemeChoice {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : 'system';
    } catch {
      return 'system';
    }
  },
  set(value: ThemeChoice): void {
    try {
      if (value === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch {
      /* private mode: the choice simply does not persist */
    }
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    applyThemeColor(value);
  }
};
