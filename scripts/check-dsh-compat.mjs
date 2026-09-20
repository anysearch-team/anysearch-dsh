import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Install released DSH components in disposable projects. Pin the complete DSH
// dependency/peer closure so an old host cannot silently borrow newer services.
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'anysearch-dsh-compat-'))
const registry = new Map()
async function metadata(name) {
  if (!registry.has(name)) registry.set(name, (async () => {
    const response = await fetch(`https://registry.npmjs.org/${name}`)
    assert.ok(response.ok, `Registry ${name}: ${response.status}`)
    return response.json()
  })())
  return registry.get(name)
}
function npm(args, cwd) {
  const options = { cwd, env: { ...process.env, npm_config_pack_destination: scratch }, encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 }
  return process.platform === 'win32'
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], options)
    : execFileSync('npm', args, options)
}
const catalog = await metadata('@deepseek-ai/dsh')
const matrix = JSON.parse(await readFile(new URL('./dsh-compat-versions.json', import.meta.url), 'utf8'))
const requested = process.argv.slice(2)
const versions = requested[0] === '--all' ? Object.keys(catalog.versions)
  : requested[0] === '--published' ? Object.keys(catalog.versions).filter(version => !matrix.unavailable[version])
  : requested.length ? requested : matrix.versions
assert.ok(versions.every(version => /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)), 'Expected DSH versions')
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json'], root))
const archive = path.join(scratch, packed.filename)
const results = []
console.log(`Evidence: ${scratch}`)
for (const version of versions) {
  const dir = path.join(scratch, version)
  await mkdir(dir)
  let phase = 'resolve'
  try {
    assert.ok(catalog.versions[version], `Unpublished DSH ${version}`)
    const dependencies = { [packageInfo.name]: `file:${archive.replaceAll('\\', '/')}` }
    const pending = [...Object.keys(packageInfo.peerDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-')), '@deepseek-ai/dsh-llm']
    while (pending.length) {
      const names = [...new Set(pending.splice(0))].filter(name => !dependencies[name])
      await Promise.all(names.map(async name => {
        const release = (await metadata(name)).versions[version]
        assert.ok(release, `${name}@${version} is not published`)
        dependencies[name] = version
        for (const dependency of Object.keys({ ...release.dependencies, ...release.peerDependencies })) {
          if (dependency.startsWith('@deepseek-ai/dsh-') && !dependencies[dependency]) pending.push(dependency)
        }
      }))
    }
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }, null, 2))
    phase = 'install'
    await writeFile(path.join(dir, 'install.log'), npm(['install', '--ignore-scripts', '--strict-peer-deps', '--no-audit', '--no-fund'], dir))
    phase = 'typecheck'
    await cp(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true })
    await cp(path.join(root, 'tsconfig.json'), path.join(dir, 'tsconfig.json'))
    const types = execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json', '--noEmit'], {
      cwd: dir, encoding: 'utf8', timeout: 60_000,
    })
    await writeFile(path.join(dir, 'typecheck.log'), types)
    phase = 'runtime'
    await cp(path.join(root, 'scripts/dsh-compat-smoke.mjs'), path.join(dir, 'smoke.mjs'))
    const output = execFileSync(process.execPath, ['smoke.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    await writeFile(path.join(dir, 'runtime.log'), output)
    results.push({ version, status: 'pass' })
    console.log(`PASS ${version}`)
  } catch (error) {
    const detail = `${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`
    await writeFile(path.join(dir, 'failure.log'), detail)
    results.push({ version, status: 'fail', phase, detail: detail.slice(0, 1500) })
    console.log(`FAIL ${version} (${phase}); see ${path.join(dir, 'failure.log')}`)
  }
  await writeFile(path.join(scratch, 'results.json'), JSON.stringify(results, null, 2))
}
if (results.some(result => result.status === 'fail')) process.exitCode = 1
