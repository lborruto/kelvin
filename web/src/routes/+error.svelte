<!-- 404 and load errors (direction-2 §7): centred in main (≤ 420 px), the help glyph in a 40 px circle, the
     h1, one muted sentence, the way out; a load error adds « Réessayer » and a « Détails » Disclosure (L2:
     code, time, address; never a stack trace or an id). -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Disclosure from '$lib/components/Disclosure.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { fmtTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { canonical, ROUTES } from '$lib/paths';

  // Defence in depth: app.html rewrites a French path before the router boots, and an in-app link
  // to an unmatched route is a full page load, so it goes through app.html too. Should the
  // pre-boot script not have run, a legacy 404 still lands on its English page here.
  let target = $derived(page.status === 404 ? canonical(page.url.pathname, page.url.hash) : null);
  $effect(() => {
    if (target) void goto(target.pathname + page.url.search + target.hash, { replaceState: true });
  });
  let notFound = $derived(page.status === 404);
  /** The cause in words: the server's own failure, Kelvin unreachable, or unexpected. */
  let cause = $derived(
    page.status === 0 || page.status === 502 || page.status === 503 ? m.page.unreachable : page.status >= 500 ? m.error.server : m.error.unexpected
  );
  const at = Date.now();
  // A full reload: the SPA's load failed, so its chunks, the session and the stream all start again.
  const retry = () => location.reload();
</script>

<svelte:head><title>{m.page.title(notFound ? m.page.notFound : m.page.errorTitle)}</title></svelte:head>

{#if !(notFound && target)}
  <section class="err" aria-labelledby="err-title">
    <span class="glyph" aria-hidden="true"><Icon name={notFound ? 'help' : 'alert'} size={20} /></span>
    <h1 id="err-title">{notFound ? m.page.notFound : m.page.load}</h1>
    <p class="lead">{notFound ? m.page.notFoundBody : cause}</p>
    <div class="actions">
      {#if notFound}
        <a class="btn btn-primary" href={ROUTES.rooms}>{m.page.goRooms}</a>
        <a class="btn" href={ROUTES.energy}>{m.nav.energy}</a>
        <a class="btn" href={ROUTES.home}>{m.nav.home}</a>
      {:else}
        <button type="button" class="btn btn-primary" onclick={retry}>{m.common.retry}</button>
        <a class="btn" href={ROUTES.rooms}>{m.page.goRooms}</a>
      {/if}
    </div>
    {#if !notFound}
      <Disclosure title={m.page.details}>
        <dl class="facts">
          <div><dt>{m.page.code}</dt><dd class="num">{page.status}</dd></div>
          <div><dt>{m.page.time}</dt><dd class="num">{fmtTime(at)}</dd></div>
          <div><dt>{m.page.route}</dt><dd>{page.url.pathname}</dd></div>
        </dl>
      </Disclosure>
    {/if}
  </section>
{/if}

<style>
  .err {
    display: grid;
    justify-items: start;
    gap: 10px;
    max-width: 420px;
    margin: 32px auto 0;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--s1);
    color: var(--mu);
  }
  h1 {
    margin: 6px 0 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .lead {
    margin: 0;
    font-size: 13px;
    color: var(--mu);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .err :global(.disclosure) {
    width: 100%;
  }
  .facts {
    display: grid;
    gap: 4px;
    margin: 0 0 4px;
    font-size: 13px;
  }
  .facts div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }
</style>
