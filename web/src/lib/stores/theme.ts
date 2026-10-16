/** Kelvin has one theme (Tableau, dark only): the light theme, its « Thème » preference and every
 * prefers-color-scheme path are gone. The browser chrome takes the ground colour (--ground in app.css),
 * the same value as app.html's theme-color meta and the PWA manifest (theme.test.ts keeps them equal). */
export const THEME_COLOR = '#050506';
