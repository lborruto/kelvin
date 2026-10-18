<!-- Maison's alerts (Tableau §3 « AlertsWidget »): « Alertes · n », « Masquer tout », then one row per alert with
     its glyph, its words (`alertText`), its link and × (Masquer). An offline radiator is a calm row, never red;
     only what the user must fix is in bad text. A failed load says so with Réessayer, never « no alerts ».
     It draws the rows Maison gives it (`list`, the first frame's until the owner asks); while the server's list
     differs (`changed`), « Mettre à jour » takes the place of « Masquer tout » on the same line, so nothing moves. -->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Alert } from '$lib/api/types';
  import { alertText } from '$lib/alerts-text';
  import { m } from '$lib/i18n';
  import { dur, T } from '$lib/motion';
  import { alerts } from '$lib/stores/alerts.svelte';
  import Icon, { type IconName } from '../Icon.svelte';

  interface Props {
    /** The rows to draw. */
    list: Alert[];
    /** The list failed to load (nothing to draw but the error and Réessayer). */
    error?: boolean;
    /** The server's list differs from `list`: « Mettre à jour » draws it. */
    changed?: boolean;
    /** Draw the server's list now (the owner asked: a dismissal, Réessayer, « Mettre à jour »). */
    onsync?: () => void;
    compact?: boolean;
  }
  let { list, error = false, changed = false, onsync = () => {}, compact = false }: Props = $props();
  const uid = $props.id();
  let shown = $derived(list.map((a) => ({ a, t: alertText(a) })).filter((x) => x.t !== null));
  const GLYPH: Record<string, IconName> = {
    price_change: 'tag',
    hc_changed: 'tag',
    radiator_unreachable: 'plug-off',
    linky_stalled: 'clock',
    consent_expiring: 'key',
    command_failed: 'alert'
  };
  const glyph = (a: Alert): IconName => GLYPH[a.kind] ?? 'alert';
  const bad = (a: Alert) => a.severity === 'bad' && a.kind !== 'radiator_unreachable';
  // A dismissal empties the row at once (the store is optimistic), so the redraw follows the owner's tap.
  const dismiss = (id: number) => {
    void alerts.dismiss(id);
    onsync();
  };
  const dismissAll = () => {
    for (const x of shown) void alerts.dismiss(x.a.id);
    onsync();
  };
  const retry = async () => {
    await alerts.load();
    onsync();
  };
</script>

{#if error}
  <div class="w err" role="alert">
    <p>{m.alerts.loadError}</p>
    <button type="button" class="btn btn-sm" onclick={retry}>{m.common.retry}</button>
  </div>
{:else if shown.length}
  <section class="w" class:compact aria-labelledby="{uid}-h">
    <div class="head">
      <h2 id="{uid}-h">{m.maison.alerts(shown.length)}</h2>
      {#if changed}
        <button type="button" class="all" aria-label={m.maison.alertsUpdateLabel} onclick={onsync}>{m.maison.alertsUpdate}</button>
      {:else}
        <button type="button" class="all" onclick={dismissAll}>{m.maison.dismissAll}</button>
      {/if}
    </div>
    <ul>
      {#each shown as { a, t } (a.id)}
        <li class:bad={bad(a)} out:fade|global={{ duration: dur(T.exit) }}>
          <span class="ic" aria-hidden="true"><Icon name={glyph(a)} size={17} /></span>
          <p>{t!.text}{#if t!.link}&nbsp;<a href={t!.link.href} rel={t!.link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                target={t!.link.href.startsWith('http') ? '_blank' : undefined}>{t!.link.label}&nbsp;›</a>{/if}</p>
          <button type="button" class="x hit" aria-label={m.alerts.dismissLabel(t!.text)} onclick={() => dismiss(a.id)}><Icon
              name="x" size={16} /></button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .w {
    padding: 14px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .w.compact {
    padding: 12px 14px;
  }
  .err {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .err p {
    margin: 0;
    font-size: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .all {
    position: relative;
    flex: none;
    white-space: nowrap;
    padding: 0;
    border: 0;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: var(--fs-label);
    font-weight: 600;
    cursor: pointer;
  }
  .all::before {
    content: '';
    position: absolute;
    inset: -14px -6px;
  }
  @media (hover: hover) {
    .all:hover {
      color: var(--tx);
    }
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    padding: 9px 0;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  .ic {
    display: grid;
    margin-top: 1px;
    color: var(--mu);
  }
  li.bad .ic,
  li.bad p {
    color: var(--bad);
  }
  p {
    margin: 0;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }
  .x {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--fa);
    cursor: pointer;
  }
  @media (hover: hover) {
    .x:hover {
      color: var(--tx);
    }
  }
</style>
