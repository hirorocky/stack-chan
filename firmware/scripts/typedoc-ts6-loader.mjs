// TypeDoc 0.28 uses the TypeScript 6 Compiler API. TypeScript 7's native
// compiler intentionally does not expose that API yet, so route only TypeDoc's
// runtime import to the official compatibility package.
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'typescript') return nextResolve('@typescript/typescript6', context)
  return nextResolve(specifier, context)
}
