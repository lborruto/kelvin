/** Svelte action: move the node to the end of <body> (or `target`), so a floating card escapes every
 * ancestor's overflow clip, containment and stacking context; it is removed with its component. Inside an
 * open modal dialog (the room sheet), the node moves to the end of that dialog instead: the rest of the page
 * is inert and under the top layer there, so a card left on <body> could be neither seen nor used. */
export function portal(node: HTMLElement, target?: HTMLElement) {
  const host = target ?? node.parentElement?.closest<HTMLElement>('dialog[open]') ?? document.body;
  host.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
