<script lang="ts">
  import { locale } from '$lib/i18n';
  import { ALL_MONTHS } from '$lib/tariff';

  interface Props {
    months: number[];
    label: string;
  }
  let { months = $bindable(), label }: Props = $props();
  const name = (mo: number) => new Intl.DateTimeFormat(locale.intl, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mo - 1, 15)));
  function toggle(mo: number, on: boolean) {
    months = on ? [...months, mo].sort((a, b) => a - b) : months.filter((x) => x !== mo);
  }
</script>

<fieldset class="months">
  <legend>{label}</legend>
  {#each ALL_MONTHS as mo (mo)}
    <label class="chip" class:on={months.includes(mo)}>
      <input type="checkbox" checked={months.includes(mo)} onchange={(e) => toggle(mo, e.currentTarget.checked)} />{name(mo)}
    </label>
  {/each}
</fieldset>

<style>
  .months {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  legend {
    font-size: 12px;
    color: var(--mu);
    margin-bottom: 6px;
    padding: 0;
  }
  /* DESIGN « copy chips »: 44 px, hairline, 13 px 600 muted; checked: s2, muted edge, ink. */
  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    min-width: 52px;
    justify-content: center;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--mu);
    cursor: pointer;
    transition: background var(--t-state), color var(--t-state), border-color var(--t-state);
  }
  .chip.on {
    background: var(--s2);
    border-color: var(--mu);
    color: var(--tx);
  }
  .chip:has(:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
</style>
