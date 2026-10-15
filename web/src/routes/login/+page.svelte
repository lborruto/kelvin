<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ApiError } from '$lib/api/client';
  import { safeNext } from '$lib/auth';
  import { errorText, m } from '$lib/i18n';
  import { tick } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<(() => string) | null>(null);
  let emailEl = $state<HTMLInputElement>();
  let passwordEl = $state<HTMLInputElement>();
  /** Which field the error is about, so it can be marked invalid and focused. */
  let invalid = $state<'email' | 'password' | 'both' | null>(null);
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
    invalid = null;
    if (!email.trim() || !password) {
      error = () => m.login.emptyFields;
      invalid = !email.trim() ? 'email' : 'password';
      await tick();
      (invalid === 'email' ? emailEl : passwordEl)?.focus();
      return;
    }
    busy = true;
    try {
      await auth.login(email.trim(), password);
      password = '';
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } catch (err) {
      error = () => errorText(err);
      // A refused account is about both fields (the password is the one to retype); a network or
      // server failure is about neither.
      invalid = err instanceof ApiError && (err.status === 401 || err.status === 403) ? 'both' : null;
      busy = false;
      await tick();
      passwordEl?.focus();
      passwordEl?.select();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{m.page.title(m.login.title)}</title></svelte:head>

<main class="login">
  <form class="box" onsubmit={submit} novalidate>
    <div class="brand">Kelvin</div>
    <h1>{m.login.title}</h1>
    <p class="muted lead">{m.login.lead}</p>
    {#if reauth}<p class="note" role="status">{m.login.reauth}</p>{/if}
    <label class="field">
      <span>Email</span>
      <input type="email" name="email" autocomplete="username" inputmode="email" bind:this={emailEl} bind:value={email}
        aria-invalid={invalid === 'email' || invalid === 'both' ? 'true' : undefined}
        aria-describedby={error && invalid !== 'password' ? 'login-error' : undefined} />
    </label>
    <label class="field">
      <span>{m.login.password}</span>
      <input type="password" name="password" autocomplete="current-password" bind:this={passwordEl} bind:value={password}
        aria-invalid={invalid === 'password' || invalid === 'both' ? 'true' : undefined}
        aria-describedby={error && invalid !== 'email' ? 'login-error' : undefined} />
    </label>
    {#if error}<p class="error" id="login-error" role="alert">{error()}</p>{/if}
    <!-- aria-disabled while busy: the focused button keeps focus through the round trip. -->
    <button type="submit" class="btn btn-primary" aria-disabled={busy}>{busy ? m.login.busy : m.login.submit}</button>
    {#if auth.simulator}<p class="muted small">{m.login.simulator}</p>{/if}
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
  input[aria-invalid='true'] {
    border-color: var(--bad);
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
