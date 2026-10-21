import { redirect } from '@sveltejs/kit';
import { ROUTES, roomSheetHref } from '$lib/paths';

/** `/rooms/<id>` (links from before the room sheet opened over any page, and the legacy French room path): the
 * sheet over Maison, `/?sheet=<id>`, with the link's other parameters (`boost`) and hash kept. */
export function load({ params, url }) {
  const to = new URL(roomSheetHref(ROUTES.rooms, params.id), url);
  for (const [k, v] of url.searchParams) if (!to.searchParams.has(k)) to.searchParams.append(k, v);
  redirect(307, `${to.pathname}${to.search}${url.hash}`);
}
