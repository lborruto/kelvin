<!-- 404 and load errors (Tableau §4 « 404 »): centred in main (≤ 420 px), the help glyph in a 56 px s1 disc,
     the h1, one muted sentence, then the ways out: the primary « Aller au tableau Maison » (large), then Énergie
     and Réglages. A load error offers « Réessayer » first and a « Détails » Disclosure (L2: code, time, address;
     never a stack trace or an id). -->
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
    <span class="glyph" aria-hidden="true"><Icon name={notFound ? 'help' : 'alert'} size={24} /></span>
    <h1 id="err-title">{notFound ? m.page.notFound : m.page.load}</h1>
    <p class="lead">{notFound ? m.page.notFoundBody : cause}</p>
    <div class="actions">
      {#if notFound}
        <a class="btn btn-primary btn-lg btn-block" href={ROUTES.rooms}>{m.page.goRooms}</a>
        <span class="more"><a class="btn" href={ROUTES.energy}>{m.nav.energy}</a><a class="btn" href={ROUTES.home}>{m.nav.home}</a></span>
      {:else}
        <button type="button" class="btn btn-primary btn-lg btn-block" onclick={retry}>{m.common.retry}</button>
        <span class="more"><a class="btn" href={ROUTES.rooms}>{m.page.goRooms}</a></span>
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
    justify-items: center;
    gap: 6px;
    max-width: 420px;
    margin: clamp(32px, 22vh, 200px) auto 0;
    text-align: center;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    margin-bottom: 12px;
    border-radius: 50%;
    background: var(--s1);
    color: var(--tx);
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .lead {
    margin: 0 0 16px;
    color: var(--mu);
  }
  .actions {
    display: grid;
    justify-items: center;
    gap: 10px;
    width: 100%;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .err :global(.disclosure) {
    width: 100%;
    margin-top: 12px;
    text-align: left;
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
