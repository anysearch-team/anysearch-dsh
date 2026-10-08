import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Exercise the real DSH installer with no compatibility or build exemptions.
// The Git repository is a disposable snapshot, never the developer's checkout.
const root = fileURLToPath(new URL('..', import.meta.url))
const cli = path.resolve(process.argv[2] || '')
assert.ok(process.argv[2], 'Usage: node scripts/check-dsh-install.mjs /path/to/dsh/lib/bin.js')
const scratch = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'anysearch-dsh-install-'))
console.log(`Evidence: ${scratch}`)
const env = { ...process.env, npm_config_registry: 'https://registry.npmjs.org' }
function run(command, args, cwd = scratch, extraEnv = {}) {
  return execFileSync(command, args, { cwd, env: { ...env, ...extraEnv },
    encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 })
}
function npm(args) {
  return process.platform === 'win32'
    ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], root,
      { npm_config_pack_destination: scratch })
    : run('npm', args, root, { npm_config_pack_destination: scratch })
}
const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json']))
const fixture = path.join(scratch, 'git-fixture')
await mkdir(fixture)
const tracked = run('git', ['ls-files', '-z'], root).split('\0').filter(Boolean)
const snapshot = new Set([...tracked, ...packed.files.map(file => file.path),
  'scripts/check-dist.mjs', 'scripts/check-dsh-install.mjs'])
for (const file of snapshot) {
  const target = path.join(fixture, file)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(path.join(root, file), target)
}
run('git', ['init', '--quiet'], fixture)
run('git', ['config', 'core.autocrlf', 'false'], fixture)
run('git', ['add', '.'], fixture)
run('git', ['-c', 'user.name=DSH installation test', '-c', 'user.email=dsh-test@example.invalid',
  '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Temporary distribution fixture'], fixture)
const revision = run('git', ['rev-parse', 'HEAD'], fixture).trim()
const cases = [
  ['archive', path.join(scratch, packed.filename)],
  ['git', `git+${pathToFileURL(fixture).href}#${revision}`],
]
const results = []
for (const [channel, specifier] of cases) {
  const home = path.join(scratch, channel)
  await mkdir(home)
  const profileEnv = { DSH_HOME: home }
  try {
    const output = run(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', specifier], scratch, profileEnv)
    await writeFile(path.join(home, 'install.log'), output)
    const profileRoot = path.join(home, 'profiles/web')
    const installed = JSON.parse(await readFile(path.join(profileRoot, 'node_modules/@anysearch/anysearch-dsh/package.json'), 'utf8'))
    assert.equal(installed.version, packed.version)
    const entry = await readFile(path.join(profileRoot, 'node_modules/@anysearch/anysearch-dsh', installed.main), 'utf8')
    assert.ok(entry.includes('registerSearchProvider'), 'Installed JS entry is missing')
    const config = run(process.execPath, [cli, '--profile', 'web', '--dump-config'], scratch, profileEnv)
    for (const pattern of [/searchProvider: anysearch/, /fetchProvider: anysearch/, /@anysearch\/anysearch-dsh/]) {
      assert.match(config, pattern)
    }
    await writeFile(path.join(home, 'composed-config.yml'), config)
    results.push({ channel, status: 'pass', version: installed.version })
    console.log(`PASS ${channel}: fresh DSH install and provider configuration without exemptions`)
  } catch (error) {
    await writeFile(path.join(home, 'failure.log'), `${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`)
    results.push({ channel, status: 'fail' })
    console.log(`FAIL ${channel}; see ${home}/failure.log`)
    process.exitCode = 1
  }
}
await writeFile(path.join(scratch, 'results.json'), JSON.stringify(results, null, 2))
