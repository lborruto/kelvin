<script lang="ts">
  import { goto } from '$app/navigation';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import type { LinkyStatus, SettingsView } from '$lib/api/types';
  import HouseActions from '$lib/components/HouseActions.svelte';
  import LinkyPanel from '$lib/components/LinkyPanel.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Stepper from '$lib/components/Stepper.svelte';
  import TariffForm from '$lib/components/TariffForm.svelte';
  import { fmtAgo, fmtDateTime, fmtTemp } from '$lib/format';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { theme, type ThemeChoice } from '$lib/stores/theme';
  import { VERSION } from '$lib/version';

  const tomorrowAt18 = () => {
    const d = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
  };

  let until = $state(tomorrowAt18());
  let awayTemp = $state(12);
  let themeChoice = $state<ThemeChoice>(theme.get());
  let now = $state(Date.now());
  let untilError = $state<string | null>(null);
  const nowLocal = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  let minUntil = $state(nowLocal());

  function startAway() {
    if (!until || new Date(until).getTime() <= Date.now()) {
      untilError = 'La fin doit être dans le futur.';
      return;
    }
    untilError = null;
    run(() => api.houseAway(until, awayTemp));
  }
  $effect(() => {
    const t = setInterval(() => {
        now = Date.now();
        minUntil = nowLocal();
      }, 30_000);
    return () => clearInterval(t);
  });

  const kindLabel = { boost: 'Forçage', away: 'Absence' } as const;
  const roomsOf = (ids: string[]) =>
    house.rooms.filter((r) => r.radiator_ids.some((i) => ids.includes(i))).map((r) => r.name).join(', ') || 'Toute la maison';

  let loggingOut = $state(false);
  async function logout() {
    loggingOut = true;
    try {
      await auth.logout();
    } catch {
      toasts.push('Déconnexion impossible. Réessayez.');
      return;
    } finally {
      loggingOut = false;
    }
    await goto('/login', { replaceState: true });
  }

  let settingsView = $state<SettingsView | null>(null);
  let linkyStatus = $state<LinkyStatus | null>(null);
  let settingsError = $state<string | null>(null);

  $effect(() => {
    api.settings().then((s) => (settingsView = s)).catch(() => (settingsError = 'Impossible de charger le tarif.'));
    api.linkyStatus().then((s) => (linkyStatus = s)).catch(() => (settingsError = 'Impossible de charger l’état du Linky.'));
  });

  // The form keeps its fields and its « Tarif enregistré. »; its price history follows the prop.
  function tariffSaved(s: SettingsView) {
    settingsView = s;
  }

  const THEMES: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'Système' },
    { value: 'dark', label: 'Sombre' },
    { value: 'light', label: 'Clair' }
  ];

  function setTheme(v: ThemeChoice) {
    themeChoice = v;
    theme.set(v);
  }
</script>

<svelte:head><title>Maison · Kelvin</title></svelte:head>

<h1>Maison</h1>

<section id="absence" class="panel">
  <h2>Absence</h2>
  <p class="muted">Tous les radiateurs passent à une température réduite, puis reprennent leur réglage à la date choisie.</p>
  <div class="row">
    <label class="field">Jusqu’au <span class="hint">(heure de Paris)</span><input type="datetime-local" min={minUntil} bind:value={until} /></label>
    <div class="field"><span>Température</span>
      <Stepper label="Température d’absence" value={awayTemp} min={7} max={19} debounceMs={0} onchange={(v) => (awayTemp = v)} />
    </div>
    <button type="button" class="primary" disabled={!until} onclick={startAway}>Activer l’absence</button>
  </div>
  {#if untilError}<p class="error" role="alert">{untilError}</p>{/if}
</section>

<section class="panel">
  <h2>En cours</h2>
  {#if house.overrides.length}
    <ul class="overrides">
      {#each house.overrides as o (o.id)}
        <li>
          <div>
            <strong>{kindLabel[o.kind]}</strong> · {roomsOf(o.radiator_ids)} · {fmtTemp(o.temperature)}
            <div class="muted small">{o.restoring ? 'Rétablissement en cours…' : `jusqu’au ${fmtDateTime(o.ends_at * 1000)}`}</div>
          </div>
          <button type="button" aria-label="Annuler {kindLabel[o.kind]} — {roomsOf(o.radiator_ids)}" onclick={() => run(() => api.cancelOverride(o.id))}>Annuler</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">Aucun forçage ni absence.</p>
  {/if}
</section>

<section class="panel">
  <h2>Actions</h2>
  <div class="row">
    <HouseActions program />
  </div>
</section>

<section id="tarif" class="panel">
  <h2>Tarif</h2>
  {#if settingsView}
    <TariffForm settings={settingsView} onsaved={tariffSaved} />
  {:else if !settingsError}
    <p class="muted">Chargement…</p>
  {/if}
</section>

<section id="linky" class="panel">
  <h2>Linky</h2>
  {#if linkyStatus}
    <LinkyPanel status={linkyStatus} onsaved={(s) => (linkyStatus = s)} />
  {:else if !settingsError}
    <p class="muted">Chargement…</p>
  {/if}
</section>
{#if settingsError}<p class="error" role="alert">{settingsError}</p>{/if}

<section class="panel">
  <h2>Réglages</h2>
  <dl>
    <dt>Compte</dt>
    <dd class="account">
      <span>{auth.email ?? '—'}</span>
      <button type="button" disabled={loggingOut} onclick={logout}>Se déconnecter</button>
    </dd>
    <dt>Cozytouch</dt>
    <dd>
      <span>{house.status.connected ? 'Connecté' : 'Injoignable'}</span>
      {#if house.status.last_ok_at}<span class="muted"> · dernière synchro {fmtAgo(house.status.last_ok_at * 1000, now)}</span>{/if}
      {#if house.status.last_error}<div class="muted small">{house.status.last_error}</div>{/if}
    </dd>
    <dt>Thème</dt>
    <dd>
      <Segmented options={THEMES} value={themeChoice} label="Thème" onchange={setTheme} />
    </dd>
    <dt>Version</dt>
    <dd class="mono">Kelvin {VERSION}</dd>
  </dl>
</section>

<style>
  h1 {
    font-size: 22px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    margin-bottom: 14px;
    max-width: 720px;
  }
  p {
    font-size: 13px;
    margin: 0 0 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
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
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--tx);
  }
  button {
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--s2);
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    background: var(--tx);
    color: var(--bg);
  }
  .overrides {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .overrides li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .hint {
    font-weight: 400;
  }
  .error {
    color: var(--bad);
    margin: 8px 0 0;
  }
  .small {
    font-size: 12px;
  }
  dl {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 10px 14px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
  }
  .account {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }
  /* Phone: the label column takes only what it needs, so the theme control fits at 390 px. */
  @media (max-width: 599px) {
    dl {
      grid-template-columns: max-content minmax(0, 1fr);
    }
  }
</style>
