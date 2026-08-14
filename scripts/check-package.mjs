import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packArgs = ['pack', '--dry-run', '--ignore-scripts', '--json']
const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', `npm.cmd ${packArgs.join(' ')}`]
  : packArgs
const packed = spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
})

assert.equal(packed.status, 0,
  packed.error?.message || packed.stderr || packed.stdout || 'npm pack --dry-run failed')

const [manifest] = JSON.parse(packed.stdout)
assert.ok(manifest, 'npm pack --dry-run returned no package manifest')

const packagedFiles = new Set(manifest.files.map(file => file.path.replaceAll('\\', '/')))
const readmes = ['README.md', 'README.zh-CN.md']
const localImages = new Set()

for (const readme of readmes) {
  const content = await readFile(new URL(`../${readme}`, import.meta.url), 'utf8')
  for (const match of content.matchAll(/<img\s+[^>]*src=["']([^"']+)["']/gi)) {
    localImages.add(match[1])
  }
  for (const match of content.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    localImages.add(match[1])
  }
}

for (const image of localImages) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(image)) continue
  const path = image.split(/[?#]/, 1)[0].replace(/^\.\//, '')
  assert.ok(packagedFiles.has(path), `README image is missing from the package: ${path}`)
}

const localImageCount = [...localImages].filter(image => !/^(?:[a-z]+:|\/\/|#)/i.test(image)).length
process.stdout.write(`PASS package contents (${packagedFiles.size} files, ${localImageCount} local README images checked)\n`)
