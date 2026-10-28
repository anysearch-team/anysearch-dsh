import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { registersModuleLoader } from '../scripts/client-artifact.mjs'

// `pnpm run build` gates the Client artifact on `registersModuleLoader`. A gate
// that can never fail is worse than no gate: it certifies a browser artifact
// that no longer registers, and the row page disappears with CI green. These
// cases pin both the pass and the two ways the guard must fail.

const root = fileURLToPath(new URL('..', import.meta.url))
const artifact = path.join(root, 'lib', 'row-page.js')

/** Strip the prose so the assertions are about code, as the build step does. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the module-loader gate', () => {
  it('passes the shipped artifact', () => {
    expect(registersModuleLoader(withoutComments(readFileSync(artifact, 'utf8')))).toBe(true)
  })

  it('fails when the registration call is deleted, even though the lookup remains', () => {
    const source = withoutComments(readFileSync(artifact, 'utf8'))
    // The lookup is still here, so a guard that tested only `__ModuleLoader__`
    // (or accepted either half) would report OK on an artifact that never
    // registers — the artifact loads, does nothing, and the row page is gone.
    const unregistered = source.replace('loader.load({', 'unusedRegistration({')
    expect(unregistered).toContain('__ModuleLoader__')
    expect(registersModuleLoader(unregistered)).toBe(false)
  })

  it('fails when the lookup is gone, even though a .load call remains', () => {
    expect(registersModuleLoader(withoutComments(readFileSync(artifact, 'utf8')).replaceAll('__ModuleLoader__', 'loaderTable')))
      .toBe(false)
  })
})
