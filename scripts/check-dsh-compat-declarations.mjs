// Guard the generated compatibility declarations against hand edits.
//
// `scripts/dsh-compat-versions.json` is the source of truth: the peer ranges,
// the documented release matrix, the compatibility summary, and the README
// coverage lines are all derived from it. A drift here means someone edited a
// derived value, or forgot to run `node scripts/update-dsh-compat.mjs`.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DSH_COMPONENT_PREFIX, markedBlock, peerPackageNames, renderCoverage, renderMatrix,
  renderPeerRange, renderSummary, sortVersions,
} from './dsh-compat-model.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const hint = 'Run `node scripts/update-dsh-compat.mjs <version>` and commit the result.'

const config = JSON.parse(await readFile(path.join(root, 'scripts/dsh-compat-versions.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const { versions } = config
const newest = sortVersions(versions).at(-1)

const range = renderPeerRange(versions)
for (const name of peerPackageNames(pkg.peerDependencies)) {
  assert.equal(pkg.peerDependencies[name], range, `${name} has a stale peer range. ${hint}`)
}
for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
  if (!name.startsWith(DSH_COMPONENT_PREFIX)) continue
  assert.equal(version, newest, `${name} does not track the newest supported release. ${hint}`)
}

const documentation = await readFile(path.join(root, 'docs/dsh-compatibility.md'), 'utf8')
for (const [name, body] of [['dsh-summary', renderSummary(versions, pkg.version)], ['dsh-matrix', renderMatrix(versions)]]) {
  assert.ok(documentation.includes(markedBlock(name, body)), `docs/dsh-compatibility.md has a stale "${name}" block. ${hint}`)
}
assert.ok(documentation.includes(`\`${newest}\` as its development baseline`),
  `docs/dsh-compatibility.md does not name ${newest} as the development baseline. ${hint}`)

for (const [file, lang] of [['README.md', 'en'], ['README.zh-CN.md', 'zh-CN']]) {
  const text = await readFile(path.join(root, file), 'utf8')
  assert.ok(text.includes(renderCoverage(versions, lang)), `${file} has a stale coverage line. ${hint}`)
}

console.log(`PASS compatibility declarations match ${versions.length} supported DSH releases`)
