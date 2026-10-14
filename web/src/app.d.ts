/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />
declare global {
  /** web/package.json's version, injected by Vite `define`. */
  const __KELVIN_VERSION__: string;
  namespace App {}
}
export {};
