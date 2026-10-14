<script lang="ts">
  import { untrack } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import { fmtAgo, fmtDateLong, fmtDay, fmtTime } from '$lib/format';
  import { plural } from '$lib/plural';

  interface Props {
    status: LinkyStatus;
    onsaved: (s: LinkyStatus) => void;
  }
  let { status, onsaved }: Props = $props();

  let prm = $state(untrack(() => status.prm ?? ''));
  let token = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let now = $state(Date.now());

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  // Progress states get a neutral line; only auth and error are problems.
  let line = $derived.by(() => {
    if (status.state === 'off') return 'Non relié.';
    if (status.state === 'never') return 'Relié · première synchronisation en attente.';
    const data = status.last_day ? ` · données jusqu’au ${fmtDay(status.last_day)}` : '';
    if (status.state === 'ok') return `Relié${data}`;
    if (status.state === 'quota') return `Relié${data} · historique en cours de récupération, la suite arrive demain`;
    if (status.state === 'throttled') {
      const at = status.retry_at ? `à ${fmtTime(status.retry_at * 1000)}` : 'plus tard';
      return `Relié${data} · Enedis limite les requêtes, nouvel essai ${at}`;
    }
    return null;
  });
  let problem = $derived(status.state === 'auth' || status.state === 'error' ? status.message : null);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    if (!/^\d{14}$/.test(prm.trim())) {
      error = 'Le PDL compte 14 chiffres.';
      return;
    }
    if (!token.trim() && !status.token_set) {
      error = 'Collez le jeton MyElectricalData.';
      return;
    }
    busy = true;
    try {
      const res = await api.putLinky(prm.trim(), token.trim() || undefined);
      token = '';
      now = Date.now();
      onsaved(res);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Erreur inattendue.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="linky">
  {#if line}<p class="state">{line}{#if status.state === 'ok' && status.last_ok_at}<span class="muted">&nbsp;· synchro {fmtAgo(status.last_ok_at * 1000, now)}</span>{/if}</p>{/if}
  {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  {#if status.simulator}<p class="muted small">Simulateur : Linky de démonstration.</p>{/if}
  {#if status.consent_expires}<p class="muted small">Consentement Enedis valable jusqu’au {fmtDateLong(status.consent_expires)}</p>{/if}
  {#if status.configured}<p class="muted small">{plural(status.calls_today, 'appel')} sur {status.budget} aujourd’hui</p>{/if}

  <form onsubmit={save} novalidate>
    <label class="field">
      <span>PDL (point de livraison)</span>
      <input inputmode="numeric" autocomplete="off" maxlength="14" bind:value={prm} />
    </label>
    <label class="field">
      <span>Jeton MyElectricalData</span>
      <input
        type="password"
        autocomplete="new-password"
        placeholder={status.token_set ? 'Enregistré — laisser vide pour le garder' : ''}
        bind:value={token} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="submit" class="primary" disabled={busy}>{busy ? 'Test en cours…' : 'Enregistrer et tester'}</button>
  </form>
  <p class="muted small">
    Le PDL figure sur la facture (14 chiffres). Le jeton s’obtient sur
    <a href="https://www.myelectricaldata.fr" target="_blank" rel="noopener noreferrer">myelectricaldata.fr</a>
    après l’accord Enedis.
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
  form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    align-items: end;
    gap: 12px;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  input {
    min-height: 44px;
    padding: 0 10px;
    font: inherit;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--tx);
  }
  .primary {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--tx);
    color: var(--bg);
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  .error {
    color: var(--bad);
    grid-column: 1 / -1;
  }
  a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
