<!-- The Tableau widget card (spec §3, `.w`): an s1 surface, radius 22, 16 × 18 padding, flat. An optional
     header row: the widget label (12.5/600 muted, a real heading) and, right, a muted aside or a « … › » link.
     `tone="heat"` edges it in heat (a running chauffe temporaire), `tone="bad"` tints it (window, conflict).
     `span` lets a grid cell take two columns. Heights are the caller's: a widget never grows on data. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The widget label; omit for a bare surface. */
    title?: string;
    /** The heading level of the label (it names the region). */
    level?: 'h2' | 'h3' | 'h4';
    /** Ink, 14 px label (« Alertes · 3 », « Programme d’aujourd’hui »): a list widget's title. */
    strong?: boolean;
    /** Right of the label: a muted word… */
    aside?: string;
    /** …or a link (« Énergie › »). */
    link?: { href: string; label: string } | null;
    /** …or anything (a TempoDot and its words, « Masquer tout »). */
    meta?: Snippet;
    tone?: 'heat' | 'bad' | null;
    span?: 1 | 2;
    pad?: 'md' | 'sm';
    class?: string;
    children: Snippet;
  }
  let { title, level = 'h3', strong = false, aside, link = null, meta, tone = null, span = 1, pad = 'md', class: cls = '', children }: Props = $props();
  const uid = $props.id();
</script>

<section class="w {pad} {tone ?? ''} {cls}" class:span2={span === 2} aria-labelledby={title ? `${uid}-t` : undefined}>
  {#if title}
    <div class="head">
      <svelte:element this={level} id="{uid}-t" class="lbl" class:strong>{title}</svelte:element>
      {#if meta}<span class="aside">{@render meta()}</span>
      {:else if link}<a class="aside lnk" href={link.href}>{link.label}</a>
      {:else if aside}<span class="aside">{aside}</span>{/if}
    </div>
  {/if}
  {@render children()}
</section>

<style>
  .w {
    min-width: 0;
    padding: 16px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
    overflow: hidden;
  }
  .w.sm {
    padding: 14px;
  }
  .span2 {
    grid-column: span 2;
  }
  .w.heat {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--heat) 35%, transparent);
  }
  .w.bad {
    background: var(--bad-tint);
    box-shadow: inset 0 0 0 1px var(--bad-edge);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    margin-bottom: 8px;
  }
  .lbl {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--mu);
    font-size: var(--fs-label);
    font-weight: 600;
  }
  .lbl.strong {
    color: var(--tx);
    font-size: 14px;
  }
  .aside {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    max-width: 60%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--mu);
    font-size: var(--fs-label);
    font-weight: 600;
  }
  .lnk {
    position: relative;
    text-decoration: none;
  }
  .lnk::before {
    content: '';
    position: absolute;
    inset: -14px -6px;
  }
  @media (hover: hover) {
    .lnk:hover {
      color: var(--tx);
    }
  }
</style>
