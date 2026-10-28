#!/usr/bin/env node
// Client-artifact post-step for the browser half.
//
// `src/row-page.ts` compiles through the same `tsc` run as the Host half, so the
// Client half stays type-checked; see `client-artifact.mjs` for why the emitted
// file then needs one surgical edit. This step removes exactly the module marker
// `tsc` appends, and then proves the result is free of module syntax, so the
// failure it guards against is loud at build time instead of silent in the
// browser.
//
// The removal happens on the last lines, after every statement the source
// declares, so the source map's line mappings for the body stay valid.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLIENT_ARTIFACT, moduleSyntax, normalizeArtifact, registersModuleLoader, stripModuleMarker } from './client-artifact.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifact = path.join(repoRoot, 'lib', CLIENT_ARTIFACT)

/** The artifact with comments removed, so a check on code cannot be satisfied by prose. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const raw = await readFile(artifact, 'utf8')
const source = normalizeArtifact(raw)
const stripped = stripModuleMarker(source)

if (moduleSyntax(stripped) !== undefined) {
  console.error(`build-client: FAIL — lib/${CLIENT_ARTIFACT} still carries module syntax (${moduleSyntax(stripped)})`)
  console.error('build-client: a Client artifact must be a classic script; see scripts/client-artifact.mjs')
  process.exit(1)
}
// Checked on the code, not the file: the header comment quotes
// `window.__ModuleLoader__.load`, so a plain substring test would pass even if
// the registration call itself were deleted. The predicate requires the lookup
// AND the call that follows it — see `registersModuleLoader`.
const code = withoutComments(stripped)
if (!registersModuleLoader(code)) {
  console.error(`build-client: FAIL — lib/${CLIENT_ARTIFACT} never registers with window.__ModuleLoader__.load`)
  process.exit(1)
}
if (stripped !== raw) await writeFile(artifact, stripped)

console.log(
  `build-client: OK — lib/${CLIENT_ARTIFACT} is a classic script${stripped === source ? ' (no module marker to strip)' : ' (module marker stripped)'}`,
)
