<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    onchange: (v: boolean) => void;
  }
  let { checked, label, pending = false, disabled = false, onchange }: Props = $props();
</script>

<button type="button" role="switch" aria-checked={checked} class="toggle" class:pending {disabled}
  onclick={() => onchange(!checked)}>
  <span class="label">{label}</span>
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</button>

<style>
  .toggle {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
  }
  .track {
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--fa);
    position: relative;
    transition: background 160ms ease;
    flex: none;
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg);
    transition: transform 160ms ease;
  }
  /* Heat colours only mean heat: "on" is the foreground, not blue. */
  [aria-checked='true'] .track {
    background: var(--tx);
  }
  [aria-checked='true'] .knob {
    transform: translateX(16px);
  }
  .pending .track {
    outline: 1px dashed var(--mu);
    outline-offset: 2px;
  }
  .toggle:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
