/// <reference types="@unplugin-pwa/core/info" />
/// <reference types="@unplugin-pwa/core/client" />
declare global {
  /** web/package.json's version, injected by Vite `define`. */
  const __KELVIN_VERSION__: string;
  namespace App {}
}
export {};
