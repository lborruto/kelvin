import { error } from '@sveltejs/kit';

/** The Tableau kit gallery: development only. `import.meta.env.DEV` is a build-time constant, so a production
 * build keeps only the 404 branch and never emits the gallery chunk (verified on `npm run build`). */
export const load = import.meta.env.DEV
  ? async () => ({ Gallery: (await import('./Gallery.svelte')).default })
  : () => error(404);
