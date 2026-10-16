<script lang="ts">
  import { untrack } from 'svelte';
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import { fmtAgo, fmtDateLong, fmtDay, fmtTime } from '$lib/format';
  import { apiMessage, errorText, m } from '$lib/i18n';

  interface Props {
    status: LinkyStatus;
    onsaved: (s: LinkyStatus) => void;
    /** The state lines above the form (false on the Linky page, which shows them as its Connexion panel). */
    meta?: boolean;
  }
  let { status, onsaved, meta = true }: Props = $props();

  let prm = $state(untrack(() => status.prm ?? ''));
  let token = $state('');
  let busy = $state(false);
  let error = $state<(() => string) | null>(null);
  let now = $state(Date.now());
  const uid = $props.id();

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  // Progress states get a neutral line; only auth and error are problems.
  let line = $derived.by(() => {
    if (status.state === 'off') return m.linky.off;
    if (status.state === 'never') return m.linky.never;
    const day = status.last_day ? fmtDay(status.last_day) : null;
    if (status.state === 'ok') return m.linky.ok(day);
    if (status.state === 'quota') return m.linky.quota(day);
    if (status.state === 'throttled') {
      return status.retry_at ? m.linky.throttledAt(day, fmtTime(status.retry_at * 1000)) : m.linky.throttledLater(day);
    }
    return null;
  });
  // The text comes from the state, in the active language; the server's French message is the fallback.
  let problem = $derived(
    status.state === 'auth' || status.state === 'error' ? apiMessage(`linky_status_${status.state}`, {}, status.message) : null
  );
  let help = $derived(m.linky.help());

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = null;
    if (!/^\d{14}$/.test(prm.trim())) {
      error = () => apiMessage('pdl_invalid');
      return;
    }
    if (!token.trim() && !status.token_set) {
      error = () => apiMessage('token_missing');
      return;
    }
    busy = true;
    try {
      const res = await api.putLinky(prm.trim(), token.trim() || undefined);
      token = '';
      now = Date.now();
      onsaved(res);
    } catch (err) {
      error = () => errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="linky">
  <!-- The state and its facts read as one block. -->
  {#if meta}<div class="meta">
    {#if line}<p class="state">{line}{#if status.state === 'ok' && status.last_ok_at}<span class="muted">&nbsp;· {m.linky.sync(fmtAgo(status.last_ok_at * 1000, now))}</span>{/if}</p>{/if}
    {#if problem}<p class="error" role="alert">{problem}</p>{/if}
    {#if status.simulator}<p class="muted small">{m.linky.simulator}</p>{/if}
    {#if status.consent_expires}<p class="muted small">{m.linky.consent(fmtDateLong(status.consent_expires))}</p>{/if}
    {#if status.configured}<p class="muted small">{m.linky.calls(status.calls_today, status.budget)}</p>{/if}
  </div>{/if}

  <form onsubmit={save} novalidate>
    <div class="fields">
    <label class="field">
      <span>{m.linky.pdl}</span>
      <input class="pdl" inputmode="numeric" autocomplete="off" maxlength="14" bind:value={prm} />
    </label>
    <div class="tok">
    <label class="field">
      <span>{m.linky.token}</span>
      <input
        class="w-text"
        type="password"
        autocomplete="new-password"
        placeholder={status.token_set ? m.linky.tokenPlaceholder : ''}
        aria-describedby={status.token_set ? `${uid}-keep` : undefined}
        bind:value={token} />
    </label>
    {#if status.token_set}<span class="hint" id="{uid}-keep">{m.linky.keepToken}</span>{/if}
    </div>
    </div>
    {#if error}<p class="error" role="alert">{error()}</p>{/if}
    <button type="submit" class="btn btn-primary" aria-disabled={busy}>{busy ? m.linky.testing : m.linky.saveTest}</button>
  </form>
  <p class="muted small">
    {help.before}
    <a href="https://www.myelectricaldata.fr" target="_blank" rel="noopener noreferrer">myelectricaldata.fr</a>
    {help.after}
  </p>
</div>

<style>
  .linky {
    display: grid;
    gap: 10px;
  }
  p {
    margin: 0;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
  }
  /* Intrinsic widths in a wrapping group (DESIGN Form fields): the PDL is 14 digits wide, the token a
     text field (--w-text); the primary button closes the form on its own line, left-aligned. */
  form {
    display: grid;
    justify-items: start;
    gap: var(--ctl-gap);
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--ctl-gap) 16px;
    width: 100%;
  }
  .pdl {
    width: min(100%, calc(14ch + 2 * var(--ctl-pad-x) + 8px));
  }
  .tok {
    flex: 1 1 14rem;
    max-width: 22rem;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .meta {
    display: grid;
    gap: 2px;
  }
  .meta:empty {
    display: none;
  }
  .tok {
    display: grid;
    gap: 4px;
  }
  .tok .w-text {
    width: 100%;
  }
  .hint {
    font-size: 12px;
    color: var(--mu);
  }
  .error {
    color: var(--bad);
  }
  a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
