<!-- A small modal choice (Programme « Copier vers… », « Aussi pour… », the Absence sheet, Menu and Fiche on a
     phone): the Tableau Sheet at 400 px on desktop, a bottom sheet on a phone. Same API as before the kit;
     new code may use Sheet directly. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    title: string;
    open: boolean;
    /** Focus goes back here when the sheet closes. */
    trigger?: HTMLElement | null;
    onclose: () => void;
    children: Snippet;
  }
  let { title, open, trigger = null, onclose, children }: Props = $props();
</script>

<Sheet {title} {open} {trigger} {onclose} width={400}>{@render children()}</Sheet>
