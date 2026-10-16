<!-- A grouped list (spec §3 « GroupedList », `.grph` + `.grp`): an optional 13 px uppercase muted label, then an
     s1 surface (radius 16) of rows split by hairlines. Rows are ListRow (or any `.li`). The label is a real
     heading naming the group. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    level?: 'h2' | 'h3' | 'h4';
    class?: string;
    children: Snippet;
  }
  let { label, level = 'h3', class: cls = '', children }: Props = $props();
  const uid = $props.id();
</script>

{#if label}<svelte:element this={level} id="{uid}-h" class="grph">{label}</svelte:element>{/if}
<div class="grp {cls}" role={label ? 'group' : undefined} aria-labelledby={label ? `${uid}-h` : undefined}>{@render children()}</div>
