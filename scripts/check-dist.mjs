import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLIENT_ARTIFACT, moduleSyntax, normalizeArtifact, stripModuleMarker } from './client-artifact.mjs'

// Git installs consume committed output without running package lifecycle scripts.
// Compile separately so CI detects stale/missing output instead of repairing it.
//
// The Client artifact is asymmetric on purpose: the REBUILT side still carries the
// module marker `tsc` appends, so it is projected before comparison, while the
// COMMITTED side must already be a classic script — the post-step is what puts it
// in that shape, and git installs never run it. Projecting both sides would make
// the check agree with a raw `tsc` output committed by hand, and that artifact is
// a SyntaxError in the browser loader.
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = await mkdtemp(path.join(tmpdir(), 'anysearch-dist-'))
async function files(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), relative))
    else result.push(relative)
  }
  return result.sort()
}
try {
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p', path.join(root, 'tsconfig.json'), '--outDir', scratch], { cwd: root, stdio: 'inherit' })
  const expected = await files(scratch)
  const actual = await files(path.join(root, 'lib'))
  assert.deepEqual(actual, expected, 'lib file list is stale; run pnpm run build and include lib in the change')
  for (const name of expected) {
    const committed = normalizeArtifact(await readFile(path.join(root, 'lib', name), 'utf8'))
    let rebuilt = normalizeArtifact(await readFile(path.join(scratch, name), 'utf8'))
    if (path.basename(name) === CLIENT_ARTIFACT) {
      const syntax = moduleSyntax(committed)
      assert.equal(syntax, undefined,
        `lib/${name} ships module syntax (${syntax}); the browser evaluates it as a classic script — run pnpm run build and commit the post-step output`)
      rebuilt = stripModuleMarker(rebuilt)
    }
    assert.equal(committed, rebuilt,
      `lib/${name} is stale; run pnpm run build and include lib in the change`)
  }
  console.log(`PASS committed build matches source (${expected.length} files)`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
