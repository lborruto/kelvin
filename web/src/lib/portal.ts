/** Svelte action: move the node to the end of <body> (or `target`), so a floating card escapes every
 * ancestor's overflow clip, containment and stacking context; it is removed with its component. */
export function portal(node: HTMLElement, target: HTMLElement = document.body) {
  target.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
