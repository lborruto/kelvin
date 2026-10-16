<script module lang="ts">
  import type { SessionInfo } from '$lib/api/types';
  import { m } from '$lib/i18n';

  /** « Safari · iPhone », « Firefox », « Navigateur inconnu · Linux »… */
  export function deviceName(s: SessionInfo): string {
    return [s.browser ?? m.sessions.unknownBrowser, s.os].filter(Boolean).join(' · ');
  }
</script>

<!-- Réglages › Compte › Appareils connectés (Tableau mockups 5 « Compte »): the rows of a grouped list, one per
     signed-in browser (browser and system names only, never the user agent), « cet appareil » for this one (it
     cannot be signed out here), « Déconnecter » for the others, then « Déconnecter les autres appareils » as a
     danger row that asks first (Annuler focused). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import { fmtAgo, fmtDateTime } from '$lib/format';
  import { errorText } from '$lib/i18n';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Sheet from './Sheet.svelte';

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
  let asking = $state(false);
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
    asking = true;
    void tick().then(() => cancel?.focus()); // the safe choice takes focus
  }
  async function revokeOthers() {
    asking = false;
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

{#if list === null && !failed}
  <div class="sk" aria-hidden="true">
    {#each [0, 1] as i (i)}<span class="skeleton inset"></span>{/each}
  </div>
{:else if failed && list === null}
  <p class="error" role="alert">{m.sessions.loadError} <button type="button" class="btn btn-sm" onclick={load}>{m.sessions.retry}</button></p>
{:else if list}
  <ul class="list" aria-label={m.sessions.title}>
    {#each list as s (s.id)}
      <li class="row">
        <div class="who">
          <span class="name">{deviceName(s)}</span>
          <span class="sub">{s.current ? m.sessions.thisDevice : m.sessions.lastActive(fmtAgo(s.last_seen * 1000, now))}</span>
          <span class="when">{m.sessions.created(fmtDateTime(s.created * 1000))}</span>
        </div>
        {#if !s.current}
          <button type="button" class="btn btn-sm" aria-disabled={!!busy} aria-busy={busy === s.id}
            aria-label={m.sessions.signOutLabel(deviceName(s))} onclick={() => revoke(s)}>{m.sessions.signOut}</button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if others > 0}
    <button type="button" class="others" aria-disabled={!!busy} onclick={ask}>{m.sessions.signOutOthers}</button>
  {/if}
{/if}

<Sheet open={asking} title={m.sessions.confirmTitle} width={400} onclose={() => (asking = false)} noClose>
  <p class="body">{m.sessions.confirmBody}</p>
  {#snippet footer()}
    <div class="actions">
      <button type="button" class="btn" bind:this={cancel} onclick={() => (asking = false)}>{m.common.cancel}</button>
      <button type="button" class="btn btn-danger" onclick={revokeOthers}>{m.sessions.signOut}</button>
    </div>
  {/snippet}
</Sheet>

<style>
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
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .row:first-child {
    border-top: 0;
  }
  .sk {
    display: grid;
    gap: 8px;
    padding: 8px 0;
  }
  .sk .skeleton {
    display: block;
    height: 56px;
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sub {
    font-size: 13px;
    color: var(--mu);
  }
  .when {
    font-size: 12px;
    color: var(--fa);
  }
  .others {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 52px;
    padding: 0;
    border: 0;
    border-top: 1px solid var(--line);
    background: none;
    color: var(--bad);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .others[aria-disabled='true'] {
    opacity: 0.4;
    cursor: default;
  }
  .others:focus-visible {
    outline-offset: -2px;
    border-radius: 8px;
  }
  .error {
    margin: 12px 0;
    color: var(--bad);
  }
  .body {
    margin: 0;
    font-size: 14px;
    color: var(--mu);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
