<!-- A grouped list (DESIGN « Lists, notices, small pieces », the global `.grph` + `.grp` classes): an optional
     13 px uppercase muted label, then an s1 surface (radius 16) of rows split by hairlines. Rows are ListRow or
     any `.li` written by the caller (a facts row `<div class="li"><dt>…</dt><dd>…</dd></div>`, an editor row, a
     panel), so the caller keeps their markup and styles. `tag` keeps the list's semantics (`ul` of `li`, `dl` of
     facts); a labelled `div` is a named group, a labelled `ul`/`dl` is named by its label. The label is a real
     heading (or a `p` where the page has no heading level for it). -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    level?: 'h2' | 'h3' | 'h4' | 'p';
    /** The label's id, when the page points at it (`aria-labelledby` on a section, a link's anchor). */
    id?: string;
    tag?: 'div' | 'ul' | 'dl';
    class?: string;
    /** The container's own id (an `aria-controls` target, an anchor). */
    listId?: string;
    children: Snippet;
  }
  let { label, level = 'h3', id, tag = 'div', class: cls = '', listId, children }: Props = $props();
  const uid = $props.id();
  let hid = $derived(id ?? `${uid}-h`);
  let named = $derived(!!label && level !== 'p');
</script>

{#if label}<svelte:element this={level} id={hid} class="grph">{label}</svelte:element>{/if}
<svelte:element this={tag} id={listId} class="grp {cls}" role={named && tag === 'div' ? 'group' : undefined}
  aria-labelledby={named ? hid : undefined}>{@render children()}</svelte:element>
