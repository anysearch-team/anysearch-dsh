// Follow newly published DSH releases without hand-editing compatibility data.
//
//   node scripts/update-dsh-compat.mjs --check           list versions to add
//   node scripts/update-dsh-compat.mjs <version> [...]   apply them
//
// `--check` only reads the registry. Applying additionally verifies that every
// declared DSH component publishes each requested version, rewrites the single
// source of truth plus everything derived from it, and bumps the patch version.
// Building `lib/` and running the released-component checks stay with
// `pnpm run build`, `pnpm run check`, and `test:compat`, so a candidate that
// breaks on a real interface fails before it can be proposed.

import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DSH_COMPONENT_PREFIX, DSH_PACKAGE, compareVersions, peerPackageNames,
  renderCoverage, renderMatrix, renderPeerRange, renderSummary, replaceMarkedBlock,
  serializeJson, sortVersions,
} from './dsh-compat-model.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const registry = process.env.DSH_COMPAT_REGISTRY || 'https://registry.npmjs.org'
const configFile = path.join(root, 'scripts/dsh-compat-versions.json')
const packageFile = path.join(root, 'package.json')
const versionFile = path.join(root, 'src/version.ts')
const documentationFile = path.join(root, 'docs/dsh-compatibility.md')

const registryCache = new Map()
async function metadata(name) {
  if (!registryCache.has(name)) registryCache.set(name, (async () => {
    const response = await fetch(`${registry}/${name}`)
    assert.ok(response.ok, `Registry ${name}: ${response.status}`)
    return response.json()
  })())
  return registryCache.get(name)
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

/** Write only real changes, so re-running an up-to-date update is a no-op. */
async function writeIfChanged(file, content) {
  const previous = await readFile(file, 'utf8')
  if (previous === content) return false
  await writeFile(file, content)
  return true
}

function bumpPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}

/** Published DSH versions that are neither supported nor documented as unavailable. */
async function detect() {
  const [catalog, config] = await Promise.all([metadata(DSH_PACKAGE), readJson(configFile)])
  const known = new Set([...config.versions, ...Object.keys(config.unavailable ?? {})])
  return sortVersions(Object.keys(catalog.versions).filter((version) => !known.has(version)))
}

async function apply(requested) {
  const [config, pkg] = await Promise.all([readJson(configFile), readJson(packageFile)])
  const peers = peerPackageNames(pkg.peerDependencies)
  assert.ok(peers.length > 0, 'package.json declares no DSH component peer packages')

  // Re-running for an already supported release refreshes derived content only;
  // it must not burn a version number.
  const added = sortVersions(requested.filter((version) => !config.versions.includes(version)))
  const versions = sortVersions([...new Set([...config.versions, ...added])])
  const previousNewest = sortVersions(config.versions).at(-1)
  const newest = versions.at(-1)
  assert.ok(compareVersions(newest, previousNewest) >= 0,
    `Newest supported version would move backwards: ${newest} < ${previousNewest}`)

  // A release documented as unavailable cannot be supported, and every declared
  // component must publish the versions that are supported; otherwise a
  // generated range would promise a compatibility the matrix cannot test.
  const catalog = await metadata(DSH_PACKAGE)
  for (const version of added) {
    assert.ok(!(version in (config.unavailable ?? {})),
      `${version} is documented as unavailable: ${config.unavailable[version]}`)
    assert.ok(catalog.versions[version], `${DSH_PACKAGE}@${version} is not published`)
    for (const name of peers) {
      const release = await metadata(name)
      assert.ok(release.versions[version], `${name}@${version} is not published`)
    }
  }

  const range = renderPeerRange(versions)
  for (const name of peers) pkg.peerDependencies[name] = range
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    if (name.startsWith(DSH_COMPONENT_PREFIX)) pkg.devDependencies[name] = newest
  }
  const nextVersion = added.length ? bumpPatch(pkg.version) : pkg.version
  pkg.version = nextVersion
  config.versions = versions

  const versionSource = await readFile(versionFile, 'utf8')
  const nextVersionSource = versionSource.replace(
    /(export const ANYSEARCH_DSH_VERSION = ')[^']*(')/, `$1${nextVersion}$2`)
  assert.ok(nextVersionSource.includes(`ANYSEARCH_DSH_VERSION = '${nextVersion}'`),
    'src/version.ts does not mirror package.json')

  let documentation = await readFile(documentationFile, 'utf8')
  documentation = replaceMarkedBlock(documentation, 'dsh-summary', renderSummary(versions, nextVersion))
  documentation = replaceMarkedBlock(documentation, 'dsh-matrix', renderMatrix(versions))
  documentation = documentation.replace(/(`)[^`\n]*(` as its development baseline)/, `$1${newest}$2`)
  documentation = documentation.replace(/(pnpm run test:compat 0\.1\.0-rc\.6 0\.2\.0-rc\.2 )\S+/, `$1${newest}`)
  assert.ok(documentation.includes(`\`${newest}\` as its development baseline`),
    'docs/dsh-compatibility.md does not name the newest supported release as its development baseline')

  // Read and validate every target before writing, so a missing anchor leaves
  // the tree untouched instead of half updated.
  const targets = [
    [packageFile, serializeJson(pkg)],
    [configFile, serializeJson(config)],
    [versionFile, nextVersionSource],
    [documentationFile, documentation],
  ]
  for (const [file, lang] of [['README.md', 'en'], ['README.zh-CN.md', 'zh-CN']]) {
    const filePath = path.join(root, file)
    const text = await readFile(filePath, 'utf8')
    const pattern = lang === 'zh-CN' ? /^- 当前源码覆盖.*$/m : /^- This source tree covers .*$/m
    assert.ok(pattern.test(text), `${file} has no coverage line to update`)
    targets.push([filePath, text.replace(pattern, () => renderCoverage(versions, lang))])
  }

  const updated = []
  for (const [file, content] of targets) {
    if (await writeIfChanged(file, content)) updated.push(path.relative(root, file).replaceAll('\\', '/'))
  }

  console.log(`Added DSH versions: ${added.length ? added.join(', ') : 'none (already supported)'}`)
  console.log(`Plugin version: ${nextVersion}`)
  console.log(updated.length ? `Updated: ${updated.join(', ')}` : 'Updated: nothing (already current)')
}

const args = process.argv.slice(2)
if (args[0] === '--check') {
  for (const version of await detect()) console.log(version)
} else if (args.length) {
  await apply(args)
} else {
  console.error('Usage: node scripts/update-dsh-compat.mjs --check | <version> [...]')
  process.exitCode = 1
}
