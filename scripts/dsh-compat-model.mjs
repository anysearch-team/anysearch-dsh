// Deterministic views over the DSH compatibility matrix.
//
// `scripts/dsh-compat-versions.json` is the single source of truth. Everything
// derived from it -- the plugin's declared peer ranges, the documented release
// matrix, and the README coverage line -- is rendered here, so supporting a new
// DSH release only means adding one version to that list.
//
// Prerelease versions cannot be covered by a broad numeric range: a prerelease
// only satisfies a range that holds a comparator with the same
// `major.minor.patch` tuple. Versions therefore stay explicitly enumerated, and
// a run of releases sharing one tuple is compressed into `>=first <=last`.

export const DSH_PACKAGE = '@deepseek-ai/dsh'
export const DSH_COMPONENT_PREFIX = '@deepseek-ai/dsh-'

function core(version) {
  return version.split('-')[0]
}

function prerelease(version) {
  return version.split('-').slice(1).join('-')
}

/** Version label used inside a release line, e.g. `alpha.2` for `0.2.1-alpha.2`. */
export function versionLabel(version) {
  return prerelease(version) || version
}

/** Semver ordering that also orders prerelease identifiers. */
export function compareVersions(a, b) {
  const aCore = core(a)
  const bCore = core(b)
  const aPre = prerelease(a)
  const bPre = prerelease(b)
  const aParts = aCore.split('.').map(Number)
  const bParts = bCore.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (aParts[index] !== bParts[index]) return aParts[index] < bParts[index] ? -1 : 1
  }
  if (aPre === bPre) return 0
  if (!aPre) return 1
  if (!bPre) return -1
  const aIds = aPre.split('.')
  const bIds = bPre.split('.')
  for (let index = 0; index < Math.max(aIds.length, bIds.length); index += 1) {
    const aId = aIds[index]
    const bId = bIds[index]
    if (aId === undefined) return -1
    if (bId === undefined) return 1
    const aNumeric = /^\d+$/.test(aId)
    const bNumeric = /^\d+$/.test(bId)
    if (aNumeric && bNumeric) {
      if (Number(aId) !== Number(bId)) return Number(aId) < Number(bId) ? -1 : 1
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1
    } else if (aId !== bId) {
      return aId < bId ? -1 : 1
    }
  }
  return 0
}

export function sortVersions(versions) {
  return [...versions].sort(compareVersions)
}

/** Supported versions grouped by `major.minor.patch`, in ascending order. */
export function releaseLines(versions) {
  const lines = []
  for (const version of sortVersions(versions)) {
    const line = core(version)
    const current = lines.at(-1)
    if (current && current.line === line) current.versions.push(version)
    else lines.push({ line, versions: [version] })
  }
  return lines
}

/** The peer range every DSH component package shares. */
export function renderPeerRange(versions) {
  return releaseLines(versions).map(({ versions: line }) =>
    line.length === 1 ? line[0] : `>=${line[0]} <=${line.at(-1)}`).join(' || ')
}

/** DSH component packages declared as peers. */
export function peerPackageNames(peerDependencies) {
  return Object.keys(peerDependencies).filter((name) => name.startsWith(DSH_COMPONENT_PREFIX))
}

/** Markdown body of the documented release matrix. */
export function renderMatrix(versions) {
  const rows = releaseLines(versions).map(({ line, versions: lineVersions }) =>
    `| ${line} | ${lineVersions.map(versionLabel).join(', ')} |`)
  return ['| Release line | Tested versions |', '| --- | --- |', ...rows].join('\n')
}

/** Markdown body of the generated compatibility summary. */
export function renderSummary(versions, pluginVersion) {
  const sorted = sortVersions(versions)
  return [
    `This source tree supports the ${sorted.length} explicitly tested DSH releases listed`,
    `below, from \`${sorted[0]}\` through \`${sorted.at(-1)}\`, and does not claim`,
    'compatibility with untested releases.',
    `These changes target plugin \`${pluginVersion}\`.`,
    'See [npm metadata](https://registry.npmjs.org/@deepseek-ai/dsh) and',
    '[upstream releases](https://github.com/deepseek-ai/deepseek-harness/releases)',
    'for the currently published releases.',
  ].join('\n')
}

/** README coverage bullet. */
export function renderCoverage(versions, lang) {
  const sorted = sortVersions(versions)
  const first = sorted[0]
  const last = sorted.at(-1)
  if (lang === 'zh-CN') {
    return `- 当前源码覆盖从 \`${first}\` 到 \`${last}\` 的 ${sorted.length} 个已发布 DSH 版本，包括 \`0.1.5-rc.2\`。具体版本、验证范围和 npm 发布状态见[兼容性说明](docs/dsh-compatibility.md)。`
  }
  return `- This source tree covers ${sorted.length} published DSH releases, from \`${first}\` through \`${last}\`, including \`0.1.5-rc.2\`. See the [version matrix, validation scope, and publication status](docs/dsh-compatibility.md).`
}

export function markedBlock(name, body) {
  return `<!-- ${name}:begin -->\n${body}\n<!-- ${name}:end -->`
}

/** Replace one generated block, leaving the surrounding reviewable prose intact. */
export function replaceMarkedBlock(text, name, body) {
  const pattern = new RegExp(`<!-- ${name}:begin -->[\\s\\S]*?<!-- ${name}:end -->`)
  if (!pattern.test(text)) throw new Error(`Missing generated block "${name}"`)
  return text.replace(pattern, () => markedBlock(name, body))
}

/** Serialize JSON exactly the way this repository stores it. */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
