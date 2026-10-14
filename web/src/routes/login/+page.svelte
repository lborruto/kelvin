<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ApiError } from '$lib/api/client';
  import { safeNext } from '$lib/auth';
  import { auth } from '$lib/stores/auth.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let reauth = $derived(page.url.searchParams.get('reauth') === '1' || auth.reauth);

  $effect(() => {
    void auth.refresh().then((ok) => {
      if (ok === true) void goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    });
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = null;
    if (!email.trim() || !password) {
      error = 'Saisissez l’email et le mot de passe Cozytouch.';
      return;
    }
    busy = true;
    try {
      await auth.login(email.trim(), password);
      password = '';
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Erreur inattendue.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Connexion · Kelvin</title></svelte:head>

<main class="login">
  <form class="box" onsubmit={submit} novalidate>
    <div class="brand">Kelvin</div>
    <h1>Connexion</h1>
    <p class="muted lead">Utilisez le compte Cozytouch de la maison.</p>
    {#if reauth}<p class="note" role="status">Reconnectez-vous avec le compte Cozytouch.</p>{/if}
    <label class="field">
      <span>Email</span>
      <input type="email" name="email" autocomplete="username" inputmode="email" bind:value={email} />
    </label>
    <label class="field">
      <span>Mot de passe</span>
      <input type="password" name="password" autocomplete="current-password" bind:value={password} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="submit" class="primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
    {#if auth.simulator}<p class="muted small">Simulateur : demo@kelvin.local · kelvin</p>{/if}
  </form>
</main>

<style>
  .login {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    background: var(--bg);
  }
  .box {
    width: min(100%, 360px);
    display: grid;
    gap: 14px;
  }
  .brand {
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  h1 {
    font-size: 22px;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .lead {
    font-size: 13px;
    margin: -6px 0 0;
  }
  .note {
    font-size: 13px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
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
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--tx);
  }
  .primary {
    min-height: 44px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
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
    font-size: 13px;
    margin: 0;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
