<script module lang="ts">
  import type { SessionInfo } from '$lib/api/types';
  import { m } from '$lib/i18n';

  /** « Safari · iPhone », « Firefox », « Navigateur inconnu · Linux »… */
  export function deviceName(s: SessionInfo): string {
    return [s.browser ?? m.sessions.unknownBrowser, s.os].filter(Boolean).join(' · ');
  }
</script>

<script lang="ts">
  import { api, ApiError } from '$lib/api/client';
  import { fmtAgo, fmtDateTime } from '$lib/format';
  import { errorText } from '$lib/i18n';
  import { toasts } from '$lib/stores/toasts.svelte';

  interface Props {
    /** True once the list (or its error) is known: what follows the panel waits for it, so the list's
     * real height never moves it (CLS). */
    ready?: boolean;
  }
  let { ready = $bindable(false) }: Props = $props();
  const uid = $props.id();
  let list = $state<SessionInfo[] | null>(null);
  let failed = $state(false);
  let busy = $state<string | null>(null);
  let dialog = $state<HTMLDialogElement>();
  let cancel = $state<HTMLButtonElement>();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  async function load() {
    failed = false;
    try {
      list = await api.sessions();
    } catch {
      failed = true;
    }
  }
  $effect(() => {
    load();
  });

  $effect(() => {
    ready = list !== null || failed;
  });
  let others = $derived((list ?? []).filter((s) => !s.current).length);

  async function revoke(s: SessionInfo) {
    if (busy) return;
    busy = s.id;
    try {
      await api.revokeSession(s.id);
      list = (list ?? []).filter((x) => x.id !== s.id);
    } catch (e) {
      // Already signed out elsewhere: the row is simply out of date.
      if (e instanceof ApiError && e.code === 'session_unknown') list = (list ?? []).filter((x) => x.id !== s.id);
      else toasts.push(() => errorText(e));
    } finally {
      busy = null;
    }
  }

  function ask() {
    if (busy) return;
    dialog?.showModal();
    cancel?.focus(); // the safe choice takes focus
  }
  async function revokeOthers() {
    dialog?.close();
    busy = 'others';
    try {
      const { revoked } = await api.revokeOtherSessions();
      toasts.push(() => m.sessions.revoked(revoked), 'info');
      await load();
    } catch (e) {
      toasts.push(() => errorText(e));
    } finally {
      busy = null;
    }
  }
</script>

<p class="muted intro">{m.sessions.intro}</p>
{#if list === null && !failed}
  <div class="sk" aria-hidden="true">
    <ul class="list">
      {#each [0, 1] as i (i)}<li class="row"><span class="skeleton inset"></span></li>{/each}
    </ul>
  </div>
{:else if failed && list === null}
  <p class="error" role="alert">{m.sessions.loadError} <button type="button" class="btn btn-sm" onclick={load}>{m.sessions.retry}</button></p>
{:else if list}
  <ul class="list" aria-label={m.sessions.title}>
    {#each list as s (s.id)}
      <li class="row">
        <div class="who">
          <span class="name">{deviceName(s)}</span>
          <span class="muted small">{s.current ? m.sessions.thisDevice : m.sessions.lastActive(fmtAgo(s.last_seen * 1000, now))}</span>
          <span class="muted small">{m.sessions.created(fmtDateTime(s.created * 1000))}</span>
        </div>
        {#if !s.current}
          <button type="button" class="btn btn-sm" aria-disabled={!!busy} aria-busy={busy === s.id}
            aria-label={m.sessions.signOutLabel(deviceName(s))} onclick={() => revoke(s)}>{m.sessions.signOut}</button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if others > 0}
    <button type="button" class="btn btn-sm others" aria-disabled={!!busy} onclick={ask}>{m.sessions.signOutOthers}</button>
  {/if}
{/if}

<dialog bind:this={dialog} aria-labelledby="{uid}-t" aria-describedby="{uid}-b">
  <h2 id="{uid}-t">{m.sessions.confirmTitle}</h2>
  <p id="{uid}-b">{m.sessions.confirmBody}</p>
  <div class="actions">
    <button type="button" class="btn" bind:this={cancel} onclick={() => dialog?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-danger" onclick={revokeOthers}>{m.sessions.signOut}</button>
  </div>
</dialog>

<style>
  .intro {
    margin: 0 0 8px;
    font-size: 13px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 56px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .row:first-child {
    border-top: 0;
  }
  /* The real row's height: name + two 12 px lines (and the sign-out button beside them, which wraps them on a phone). */
  .sk {
    container-type: inline-size;
  }
  .row .skeleton {
    display: block;
    width: 100%;
    height: 56px;
  }
  @container (max-width: 280px) {
    .row:nth-child(2) .skeleton {
      height: 91px;
    }
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .small {
    font-size: 12px;
  }
  .others {
    margin-top: 8px;
  }
  .error {
    color: var(--bad);
  }
  /* The same dialog as « Tout éteindre » (DESIGN: Dialog). */
  dialog {
    background: var(--s1);
    color: var(--tx);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    width: min(340px, calc(100vw - 32px));
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: 200ms;
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
  dialog::backdrop {
    background: transparent;
    transition:
      background-color var(--t-exit) ease,
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open]::backdrop {
    background: color-mix(in srgb, var(--bg) 72%, transparent);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open] {
      transform: none;
    }
  }
  dialog h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }
  dialog p {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--mu);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
