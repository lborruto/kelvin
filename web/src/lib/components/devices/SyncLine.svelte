<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SyncStatus } from '$lib/api/types';
  import { fmtAgo, fmtTime } from '$lib/format';
  import { errorText, m } from '$lib/i18n';
  import { syncInfo, whenText } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
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

<section class="sync" aria-labelledby="{uid}-title">
  <div class="text">
    <p id="{uid}-title" class="main">
      {info.lastMs === null ? m.devices.neverSynced : m.devices.syncedAgo(fmtAgo(info.lastMs, now))}
    </p>
    <p class="muted"><span>{m.devices.budget(sync.used, sync.limit)}</span> · <span>{m.devices.dailyAt(fmtTime(info.nextDailyMs))}</span></p>
    {#if info.nextPossibleMs !== null}
      <p class="muted" id="{uid}-spent">{m.devices.spent(whenText(info.nextPossibleMs, now))}</p>
    {/if}
    {#if info.staleSinceMs !== null}
      <p class="notice"><Icon name="alert" size={14} /> {m.devices.stale}</p>
    {/if}
  </div>
  <button
    type="button"
    class="btn btn-sm"
    aria-disabled={paused}
    aria-describedby={info.nextPossibleMs !== null ? `${uid}-spent` : `${uid}-help`}
    onclick={syncNow}
  >
    <Icon name="flash" size={16} />{info.requested || sending ? m.devices.syncing : m.devices.sync}
  </button>
  <span class="visually-hidden" id="{uid}-help">{m.devices.syncHelp}</span>
</section>

<style>
  .sync {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px 16px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    margin-bottom: 14px;
    max-width: 720px;
  }
  .text {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1 1 240px;
  }
  p {
    margin: 0;
    font-size: 13px;
  }
  .main {
    font-weight: 600;
  }
  .muted {
    color: var(--mu);
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
</style>
