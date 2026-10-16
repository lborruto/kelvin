<!-- « Tout est éteint » (Tableau §3 « AllOffBanner »): after Tout éteindre, the way back in one primary
     « Tout remettre en programme »; an offline room is named calmly (it may not have received the command).
     No time is shown: Kelvin does not know when the house went off. -->
<script lang="ts">
  import { runHouse } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { m } from '$lib/i18n';
  import { house } from '$lib/stores/house.svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    offline: string[];
    phone?: boolean;
  }
  let { offline, phone = false }: Props = $props();
  let busy = $derived(house.houseCommand?.status === 'sending' || house.houseCommand?.status === 'pending');
  let blocked = $derived(busy || !house.online);
</script>

<div class="w" class:phone role="status">
  <span class="pm" aria-hidden="true"><Icon name="power" size={18} /></span>
  <div class="tx">
    <b>{m.maison.allOff}</b>
    {#if offline.length}<span>{m.maison.allOffOffline(offline, offline.length)}</span>{/if}
  </div>
  <button type="button" class="btn btn-primary" class:btn-lg={phone} class:btn-block={phone} aria-disabled={blocked}
    onclick={() => !blocked && runHouse(() => api.houseProgram())}><Icon name="resume" size={16} />{m.houseActions.allProgram}</button>
</div>

<style>
  .w {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .w.phone {
    padding: 14px 16px;
  }
  .pm {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--mu);
  }
  .tx {
    display: grid;
    flex: 1;
    min-width: 200px;
  }
  .phone .tx {
    min-width: 0;
    flex-basis: calc(100% - 52px);
  }
  b {
    font-weight: 600;
  }
  .tx span {
    color: var(--mu);
    font-size: 13px;
  }
</style>
