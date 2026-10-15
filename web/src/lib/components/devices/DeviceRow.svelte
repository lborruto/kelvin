<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SetupDevice } from '$lib/api/types';
  import { fmtAgo } from '$lib/format';
  import { m } from '$lib/i18n';
  import { detailRows, deviceLabel } from '$lib/setup';

  interface Props {
    device: SetupDevice;
    now: number;
    children?: Snippet;
  }
  let { device, now, children }: Props = $props();
  let rows = $derived(detailRows(device));
  let name = $derived(deviceLabel(device));
  let reach = $derived(device.reachable === null ? null : device.reachable ? m.devices.reachable : m.devices.unreachable);
</script>

<li class="device" class:misplaced={device.misplaced}>
  <div class="head">
    <span class="role">{m.devices.role[device.role]}</span>
    <span
      class="chip"
      class:bad={device.reachable === false}
      role={reach === null ? 'img' : undefined}
      aria-label={reach === null ? m.devices.reachUnknownLabel : undefined}>{reach ?? '—'}</span
    >
  </div>
  <div class="meta">
    <span class="label">{name}</span>
    <span class="mono widget">{device.widget}</span>
  </div>
  <p class="signal">
    {device.last_event_at === null ? m.devices.lastSignalNone : m.devices.lastSignal(fmtAgo(device.last_event_at * 1000, now))}
  </p>
  {#if rows.length}
    <details class="more">
      <summary aria-label={m.devices.detailsOf(name)}>{m.devices.details}</summary>
      <dl>
        {#each rows as row (row.state)}
          <div class="row">
            <dt>{row.label}{#if row.raw} <span class="mono state">{row.state}</span>{/if}</dt>
            <dd class:mono={row.raw}>{row.value}</dd>
          </div>
        {/each}
      </dl>
    </details>
  {/if}
  {@render children?.()}
</li>

<style>
  .device {
    display: grid;
    gap: 4px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
    min-width: 0;
  }
  .head,
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    min-width: 0;
  }
  .role {
    font-weight: 600;
    font-size: 14px;
  }
  .chip {
    font-size: 12px;
    color: var(--mu);
    padding: 1px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .chip.bad {
    color: var(--tx);
    border-color: color-mix(in srgb, var(--bad) 60%, var(--line));
    background: color-mix(in srgb, var(--bad) 14%, transparent);
  }
  .label {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .widget,
  .state {
    font-size: 11px;
    color: var(--mu);
    overflow-wrap: anywhere;
  }
  /* The Cozytouch state name sits under its label (raw values only), never glued to it. */
  .state {
    display: block;
  }
  .signal {
    margin: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .more summary {
    font-size: 12px;
    color: var(--mu);
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    font-size: 13px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
