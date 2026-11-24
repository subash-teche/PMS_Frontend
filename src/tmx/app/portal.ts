/**
 * Where a popup menu is drawn. The Task Management screens live in a Shadow DOM (so their stylesheet cannot clash with
 * PMS styles), and a popup drawn straight into document.body would be outside it and lose its styling.
 */
export const portalTarget = (el: Element | null): Element => {
  const root = el?.getRootNode()
  return root instanceof ShadowRoot ? (root.querySelector('.tmx-root') ?? document.body) : document.body
}

/** The element a pointer event really happened on (inside a Shadow DOM the event is retargeted to the host). */
export const eventTarget = (e: Event): Node => (e.composedPath()[0] ?? e.target) as Node
