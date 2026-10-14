/** French plural for a count: `1 pièce`, `3 pièces`, `0 pièce`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n < 2 ? one : many}`;
}
