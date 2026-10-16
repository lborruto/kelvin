<!-- Shared SVG definitions, mounted once in the layout: charts reference them by id.
     `hc-hatch` is the off-peak hatch (DESIGN « Tariff blues »): 1 px lines of the ground at 35 % every
     4 px at 45°, drawn over an --hc fill (a second rect with fill="url(#hc-hatch)"). -->
<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="hc-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
      <rect class="line" width="1" height="4" />
    </pattern>
  </defs>
</svg>

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
  .line {
    fill: var(--bg);
    fill-opacity: 0.35;
  }
</style>
