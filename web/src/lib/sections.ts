import { flushSync } from 'svelte';

/**
 * An in-page link to an Énergie section (#energy-where, #offpeak, #projection, #curve): the section is revealed first
 * (`reveal`, run synchronously: a collapsed section opens, the Courbe's sheet opens), then scrolled to. SvelteKit
 * intercepts a same-hash click and a collapsed `hidden="until-found"` target is not reliably revealed by the browser,
 * so the link never relies on the native jump. Its `scroll-margin-top` keeps it clear of the condensed period bar.
 */
export function goToSection(e: MouseEvent, id: string, reveal?: ((id: string) => void) | null) {
  e.preventDefault();
  if (reveal) flushSync(() => reveal(id));
  document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
}
