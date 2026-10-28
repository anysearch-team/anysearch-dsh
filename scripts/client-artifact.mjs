// Shared rules for the one Client (browser) artifact this package ships.
//
// `src/row-page.ts` is compiled by the same `tsc` run as the Host half, which is
// what keeps the Client half type-checked. But a `.ts` file inside a
// `"type": "module"` package is ALWAYS a module under `module: NodeNext`, even
// when its source declares neither imports nor exports, so `tsc` appends the
// `export {}` module marker to `lib/row-page.js`.
//
// The browser module table evaluates a Client artifact as a CLASSIC script
// (`window.__ModuleLoader__.load({ id, factory })`), where a top-level
// `export {}` is a SyntaxError — the page would lose the whole artifact, and
// with it the plugin row's Configure control.
//
// Two callers need this rule and must not drift apart:
//   - `scripts/build-client.mjs` normalizes and strips the built artifact;
//   - `scripts/check-dist.mjs` compares a fresh `tsc` build against the committed
//     `lib/`: it strips only the REBUILT side and asserts the committed side is
//     already marker-free, so a raw `tsc` output committed by hand fails instead
//     of being quietly normalized into agreement.
//
// Line endings are normalized first: a Windows/`core.autocrlf` checkout hands the
// artifact over as CRLF, where a marker regex written for LF silently misses and
// the build then fails on its own syntax guard.

/** Basename, inside `lib/`, of the Client artifact the browser loads. */
export const CLIENT_ARTIFACT = 'row-page.js'

/** Normalize line endings so every rule below matches one shape of text. */
export function normalizeArtifact(text) {
  return text.replaceAll('\r\n', '\n')
}

/** Remove the module marker `tsc` appends to a module-shaped file, if present. */
export function stripModuleMarker(text) {
  return text.replace(/\nexport \{\};\n/, '\n')
}

/** The first top-level `import`/`export` statement, or `undefined` when the script has none. */
export function moduleSyntax(text) {
  return text.match(/^\s*(?:import|export)\s.*$/m)?.[0].trim()
}

/**
 * Whether comment-free code still performs the classic-script registration: the
 * `__ModuleLoader__` lookup followed by a `.load({ … })` call on it. Both halves
 * are required. Checking either one alone is a gate that cannot fail — the
 * lookup survives when the registration is deleted, and `.load(` alone could be
 * any other object's method.
 */
export function registersModuleLoader(code) {
  return /__ModuleLoader__[\s\S]*?\.load\s*\(\s*\{/.test(code)
}
