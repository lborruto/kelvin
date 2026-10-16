<!-- The setup's freshness on Pièces et appareils (direction-2 §4): one source line, « ○ Synchronisé avec
     Cozytouch il y a 1 min », whose Fiche gives the full-read budget, the daily time and the last full read,
     and a ghost « Synchroniser » (spinner glyph while it runs; paused with « possible à 14:30 » when the budget
     is spent). A change made in the Cozytouch app and not read yet is said under it. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SyncStatus } from '$lib/api/types';
  import { fmtAgo, fmtDateTime, fmtTime } from '$lib/format';
  import type { Fresh } from '$lib/freshness';
  import { errorText, m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import { syncInfo, whenText } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Fig from '../Fig.svelte';
  import Freshness from '../Freshness.svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    sync: SyncStatus;
    now: number;
  }
  let { sync, now }: Props = $props();
  const uid = $props.id();
  let info = $derived(syncInfo(sync));
  let sending = $state(false);
  // aria-disabled, never disabled: the button keeps focus while a sync runs or the budget is spent.
  let paused = $derived(sending || !info.canSync);
  let running = $derived(info.requested || sending);
  let fresh = $derived<Fresh>(running || info.staleSinceMs !== null ? 'late' : info.lastMs === null ? 'late' : 'fresh');
  let words = $derived(info.lastMs === null ? m.devices.neverSynced : m.devices.syncedAgo(fmtAgo(info.lastMs, now)));
  let notes = $derived([
    m.devices.budget(sync.used, sync.limit),
    m.devices.dailyAt(fmtTime(info.nextDailyMs)),
    ...(info.nextPossibleMs !== null ? [m.devices.spent(whenText(info.nextPossibleMs, now))] : []),
    m.devices.syncHelp
  ]);

  async function syncNow(): Promise<void> {
    if (paused) return;
    sending = true;
    // Optimistic: the line says « en cours » at once. The 202's own `sync` is never applied: the
    // pump may read and publish `layout` before the 202 is parsed, and that newer truth must not
    // be overwritten (review T10-1). The layout event or the re-fetch below brings the truth.
    if (house.setup?.sync) house.applySetup({ ...house.setup, sync: { ...house.setup.sync, requested: true } });
    try {
      await api.syncSetup();
    } catch (e) {
      toasts.push(() => errorText(e));
    } finally {
      sending = false;
    }
    try {
      const fresh = await api.setupDevices();
      if (fresh) house.applySetup(fresh);
    } catch {
      /* the 30 s reload will bring it */
    }
  }
</script>

<section class="sync" aria-label={m.devices.syncTitle}>
  <p class="line">
    <Freshness state={fresh} />
    <Fig value={words} title={m.devices.syncTitle}
      rows={[{ label: m.devices.lastFull, value: info.lastMs === null ? '—' : fmtDateTime(info.lastMs), note: info.lastMs === null ? m.devices.neverSynced : null }]}
      {notes} provenance={provenance('cozytouch', { at: info.lastMs ?? undefined }, now)}><span class="words">{words}</span></Fig>
  </p>
  <div class="act">
    <button type="button" class="btn btn-sm btn-ghost" aria-disabled={paused}
      aria-describedby={info.nextPossibleMs !== null && !running ? `${uid}-spent` : undefined} onclick={syncNow}>
      <span class="glyph" class:spin={running}><Icon name="sync" size={16} /></span>{running ? m.devices.syncing : m.devices.sync}
    </button>
    {#if info.nextPossibleMs !== null && !running}<span class="when" id="{uid}-spent">{m.devices.syncAt(whenText(info.nextPossibleMs, now))}</span>{/if}
  </div>
  {#if info.staleSinceMs !== null}
    <p class="notice"><Icon name="alert" size={14} /> {m.devices.stale}</p>
  {/if}
</section>

<style>
  .sync {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 16px;
    min-height: 44px;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    min-width: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .words {
    overflow-wrap: anywhere;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .glyph {
    display: inline-flex;
  }
  .spin {
    animation: kv-spin 1s linear infinite;
  }
  @keyframes kv-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
  .when {
    font-size: 12px;
    color: var(--mu);
  }
  .notice {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 13px;
  }
</style>
