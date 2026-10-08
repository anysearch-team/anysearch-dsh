import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Git installs consume committed output without running package lifecycle scripts.
// Compile separately so CI detects stale/missing output instead of repairing it.
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
    const normalize = text => text.replaceAll('\r\n', '\n')
    assert.equal(normalize(await readFile(path.join(root, 'lib', name), 'utf8')),
      normalize(await readFile(path.join(scratch, name), 'utf8')),
      `lib/${name} is stale; run pnpm run build and include lib in the change`)
  }
  console.log(`PASS committed build matches source (${expected.length} files)`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
