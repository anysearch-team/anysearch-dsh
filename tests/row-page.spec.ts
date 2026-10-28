import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The Client half is a browser artifact: a classic script that registers a lazy
// factory with `window.__ModuleLoader__.load`. Nothing here imports it — it is
// evaluated the way the browser module table evaluates it, so these tests cover
// the shipped file rather than the TypeScript source. The unit under test is
// exactly what DSH loads, and a build that stops producing a classic script
// fails here before it can fail silently in the page.

const root = fileURLToPath(new URL('..', import.meta.url))
const artifact = path.join(root, 'lib', 'row-page.js')
const shipped = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  dsh: { client?: { platform?: string; inject?: string[] } }
}

/** Evaluate the artifact as a classic script and capture its loader entry. */
function loadArtifact(extra: Record<string, unknown> = {}): { id: string; factory: (require: (specifier: string) => any) => any } {
  const captured: { id?: string; factory?: (require: (specifier: string) => any) => any } = {}
  const loader = {
    load(entry: { id: string; factory: (require: (specifier: string) => any) => any }) {
      captured.id = entry.id
      captured.factory = entry.factory
    },
  }
  const sandbox: Record<string, unknown> = { __ModuleLoader__: loader, ...extra }
  sandbox.globalThis = sandbox
  createContext(sandbox)
  runInContext(readFileSync(artifact, 'utf8'), sandbox)
  if (captured.factory === undefined || captured.id === undefined) {
    throw new Error('lib/row-page.js never registered a factory with __ModuleLoader__')
  }
  return { id: captured.id, factory: captured.factory }
}

/**
 * The React shim the component actually calls. Each render pass installs the
 * pass's hook runtime here, so the module captured at factory time always talks
 * to the runtime of the pass being rendered.
 */
let activeReact: Record<string, (...args: any[]) => unknown> = {}
const reactShim = new Proxy(
  {},
  {
    get: (_target, key: string) => (...args: unknown[]) => {
      const hook = activeReact[key]
      if (hook === undefined) throw new Error(`the page called React.${key}, which the shim does not provide`)
      return hook(...args)
    },
  },
) as Record<string, (...args: any[]) => unknown>

/**
 * Render a component to a settled state: hooks keep their state between passes,
 * effects run inline (as the page's loader does), and the loop stops as soon as
 * a pass writes no state. This is what lets the page's async load finish before
 * the assertions look at what it painted.
 */
async function renderUntilSettled<T>(
  component: (props: T) => unknown,
  props: T,
  passes = 8,
  // Reusing the hook slots continues the same mount, which is what lets a test
  // type into the field and then act on the control that render painted.
  hooks: unknown[] = [],
): Promise<unknown> {
  let tree: unknown
  for (let pass = 0; pass < passes; pass += 1) {
    // Buttons painted by the previous pass must not accumulate: the harness
    // re-renders the whole tree each pass, so a sink without a reset would report
    // one action row per pass and hand tests stale handlers.
    buttonSink.current = []
    let cursor = 0
    let changed = false
    const effects: Array<() => unknown> = []
    activeReact = {
      createElement: (type: unknown, componentProps: Record<string, unknown> | null, ...children: unknown[]) => {
        // Render function components eagerly: this harness has no reconciler, and
        // the page's assertions are about the props it hands its primitives.
        if (typeof type === 'function') {
          return (type as (props: Record<string, unknown>) => unknown)({ ...(componentProps ?? {}), children })
        }
        return { type, props: componentProps ?? {}, children }
      },
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in hooks)) hooks[index] = initial
        return [
          hooks[index],
          (next: unknown) => {
            if (hooks[index] !== next) {
              hooks[index] = next
              changed = true
            }
          },
        ]
      },
      useRef: (initial: unknown) => {
        const index = cursor++
        if (!(index in hooks)) hooks[index] = { current: initial }
        return hooks[index]
      },
      useCallback: (callback: unknown) => {
        cursor += 1
        return callback
      },
      useMemo: (factory: () => unknown) => {
        cursor += 1
        return factory()
      },
      useEffect: (effect: () => unknown) => {
        cursor += 1
        effects.push(effect)
      },
      // The real store hook: read once per pass after subscribing, then drop the
      // subscription. The harness re-renders from scratch each pass, so a live
      // subscription would only accumulate listeners.
      useSyncExternalStore: (subscribe: (listener: () => void) => () => void, read: () => unknown) => {
        const off = subscribe(() => undefined)
        off?.()
        return read()
      },
    }
    tree = component(props)
    await Promise.all(effects.map((effect) => effect()))
    // Let the microtask queue drain before deciding the pass changed nothing: a
    // read that rejects writes its failure state in a `catch`, and without this
    // turn a settled render could be asserted before that state ever landed.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!changed) break
  }
  return tree
}

/** Buttons painted by the pass in flight (reset by `renderUntilSettled`). */
const buttonSink: { current: Array<{ onClick?: (() => void) | undefined; disabled?: boolean | undefined; children?: unknown }> } = {
  current: [],
}

/** The primitives module the page renders with, capturing the props it receives. */
function createPrimitives(captured: {
  hint?: string | undefined
  text?: string | undefined
  disabled?: boolean | undefined
  state?: Record<string, unknown> | undefined
  onEdit?: ((text: string) => void) | undefined
  onSave?: (() => void) | undefined
  buttonOnClick?: (() => void) | undefined
  buttonDisabled?: boolean | undefined
  buttonText?: unknown
  /** Every Button painted in order: the card composes its own action row now. */
  buttons?: Array<{ onClick?: (() => void) | undefined; disabled?: boolean | undefined; children?: unknown }>
}) {
  const SettingsSecretField = (props: {
    hint?: string
    text?: string
    disabled?: boolean
    onEdit?: (text: string) => void
  }) => {
    captured.hint = props.hint
    captured.text = props.text
    captured.disabled = props.disabled
    captured.onEdit = props.onEdit
    return null
  }
  const SettingsForm = (props: {
    children?: unknown
    state?: Record<string, unknown>
    onSave?: () => void
  }) => {
    captured.state = props.state
    captured.onSave = props.onSave
    return props.children ?? null
  }
  const Button = (props: { onClick?: () => void; disabled?: boolean; children?: unknown }) => {
    buttonSink.current.push(props)
    captured.buttons = buttonSink.current
    captured.buttonOnClick = props.onClick
    captured.buttonDisabled = props.disabled
    captured.buttonText = props.children
    return null
  }
  return { SettingsForm, SettingsSecretField, Button }
}

/**
 * The serialized schemastery envelope the Host actually sends for the web
 * entry: a reference graph (`uid` + `refs`), not the live schema's own `dict`.
 * Verified against schemastery 3.18.5 — a convenient `{dict: …}` fixture is
 * exactly what let the card miss the entry on a real deployment.
 */
const WEB_SCHEMA = {
  uid: 4,
  refs: {
    '1': { type: 'string', meta: { volatile: true } },
    '3': { type: 'string', meta: { volatile: true } },
    '4': { type: 'object', meta: { default: {} }, dict: { searchProvider: 1, fetchProvider: 3 } },
  },
}

/** The shared configuration-form service, as the provider card consumes it. */
interface ConfigFormsStub {
  /** How many times the card asked the mirror to load. */
  ensures: number
  describe(): {
    getSnapshot(): {
      status?: string
      view?: { namespaces?: Array<{ ns: string; value?: unknown; schema?: unknown }> }
    }
    subscribe(listener: () => void): () => void
    ensure(): void
  }
  get(entryId: string): {
    getSnapshot(): Record<string, unknown>
    subscribe(listener: () => void): () => void
    mutate(ops: unknown[], expectedRevision?: number): Promise<boolean>
  }
}

/** A stub `ctx.configForms`: one mirror with namespace rows, one shared form. */
function createConfigForms(options: {
  namespaces?: Array<{ ns: string; value?: unknown; schema?: unknown }>
  /** Omit the held document, as before the mirror's first describe read. */
  viewLoaded?: boolean
  /** The mirror store status while that document is missing. */
  status?: string
  snapshot?: Record<string, unknown>
  mutate?: (ops: unknown[]) => Promise<boolean>
}): ConfigFormsStub {
  const namespaces = options.namespaces ?? []
  const viewLoaded = options.viewLoaded ?? true
  const status = options.status ?? 'ready'
  const snapshot = options.snapshot ?? { status: 'ready', value: {}, writable: true }
  const form = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    mutate: options.mutate ?? (async () => true),
  }
  let ensures = 0
  return {
    get ensures() {
      return ensures
    },
    describe: () => ({
      getSnapshot: () => (viewLoaded ? { status, view: { namespaces } } : { status }),
      subscribe: () => () => undefined,
      ensure: () => {
        ensures += 1
      },
    }),
    get: () => form,
  }
}

/** The Client context `apply` receives: only what the page touches. */
function createContext_(dictionaries: Record<string, unknown>[], configForms?: ConfigFormsStub) {
  const registered: { name: string; key?: string | undefined; id?: string | undefined; component: unknown }[] = []
  const effects: string[] = []
  return {
    registered,
    effects,
    ctx: {
      effect: (callback: () => void, label?: string) => {
        effects.push(label ?? '')
        callback()
      },
      locale: {
        bind: () => (key: string, params?: Record<string, unknown>) => {
          const template = `${key}:${JSON.stringify(params ?? {})}`
          return template
        },
        register: (namespace: string, table: Record<string, unknown>) => {
          dictionaries.push({ namespace, ...table })
          return () => undefined
        },
      },
      slots: {
        inject: (_name: string, callback: () => unknown) => {
          callback()
          return () => undefined
        },
        register: (
          options: { name: string; key?: string; id?: string; order?: number; locale?: string },
          component: unknown,
        ) => {
          registered.push({ name: options.name, key: options.key, id: options.id, component })
          return component
        },
      },
      ...(configForms === undefined ? {} : { configForms }),
    },
  }
}

/**
 * Mount the plugin's provider card the way `plugins.detail.section` does: real
 * artifact, stub `configForms`, and the subject the slot passes. Returns the
 * settled tree plus the hook slots, so a test can act and re-render the same
 * mount (the assertions are about what the page paints after an action).
 */
async function renderWebSource(options: {
  namespaces?: Array<{ ns: string; value?: unknown; schema?: unknown }>
  viewLoaded?: boolean
  status?: string
  snapshot?: Record<string, unknown>
  mutate?: (ops: unknown[]) => Promise<boolean>
  subject?: string
}): Promise<{
  tree: unknown
  section: (props: Record<string, unknown>) => unknown
  captured: Parameters<typeof createPrimitives>[0]
  hooks: unknown[]
  forms: ConfigFormsStub
}> {
  const { factory } = loadArtifact()
  const captured: Parameters<typeof createPrimitives>[0] = {}
  const primitives = createPrimitives(captured)
  const module = factory((specifier: string) => {
    if (specifier === 'react') return reactShim
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected specifier: ${specifier}`)
  })
  const forms = createConfigForms(options)
  const harness = createContext_([], forms)
  module.apply(harness.ctx)
  const section = harness.registered.find((row) => row.name === 'plugins.detail.section')?.component as
    | ((props: Record<string, unknown>) => unknown)
    | undefined
  if (section === undefined) throw new Error('the provider card was not registered')
  const props = { subject: { pkg: options.subject ?? '@anysearch/anysearch-dsh' } }
  const hooks: unknown[] = []
  const tree = await renderUntilSettled(section, props, 8, hooks)
  return { tree, section, captured, hooks, forms }
}

describe('the shipped Client artifact', () => {
  it('is a classic script that declares the package id and the row it claims', () => {
    const { id } = loadArtifact()
    expect(id).toBe('@anysearch/anysearch-dsh')

    const source = readFileSync(artifact, 'utf8')
    expect(source).not.toMatch(/^\s*(?:import|export)\s/m)
    // The loader id and the claimed row key are composed at runtime from these
    // two literals, so the artifact carries the parts rather than the joined key.
    expect(source).toContain('@anysearch/anysearch-dsh')
    expect(source).toContain('web-search-anysearch')
  })

  it('is wired in package.json: the export resolves to the artifact and the inject list is complete', () => {
    expect(shipped.exports['./client']).toBe('./lib/row-page.js')
    expect(shipped.dsh.client?.platform).toBe('web')
    // The page reads ctx.remote.credentials directly, so both the namespace and
    // its credentials face must be declared injects.
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-api-remotes')
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-client-locale')
    expect(shipped.dsh.client?.inject).toContain('@deepseek-ai/dsh-client-ui-plugin-manager')
  })

  it('installs the card rules once, from host tokens only', () => {
    const style = { id: '', textContent: '', setAttribute: () => undefined, remove: () => undefined }
    const appended: unknown[] = []
    const documentStub = {
      head: { appendChild: (node: unknown) => { appended.push(node) } },
      createElement: () => style,
      getElementById: () => null,
    }
    const { factory } = loadArtifact({ document: documentStub })
    const primitives = createPrimitives({})
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    module.apply(createContext_([]).ctx)

    expect(appended).toHaveLength(1)
    expect(style.id).toBe('anysearch-client-styles')
    const css = style.textContent
    // The card contract itself: a hairline card, the sunken body, the 13/600
    // title, the 12 tertiary hint, and the facts grid with a max-content label
    // column on the value's baseline.
    expect(css).toContain('.anysearch-card{')
    expect(css).toContain('border:.5px solid var(--dsw-alias-border-l2)')
    expect(css).toContain('border-radius:var(--dsw-radius-lg)')
    expect(css).toContain('padding:14px')
    expect(css).toContain('gap:10px')
    expect(css).toContain('background:var(--dsw-alias-interactive-bg-hover)')
    expect(css).toContain('border-radius:var(--dsw-radius-md)')
    expect(css).toContain('font-size:13px;font-weight:600')
    expect(css).toContain('font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)')
    expect(css).toContain('grid-template-columns:max-content minmax(0,1fr)')
    expect(css).toContain('column-gap:14px')
    expect(css).toContain('align-items:baseline')
    // A hex fallback belongs to no theme, and an `ops-` prefix would claim
    // another plugin's namespace.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i)
    expect(css).not.toContain('ops-')
  })

  it('claims exactly the plugins.row.config key and registers both dictionaries', () => {
    const { factory } = loadArtifact()
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    const primitives = createPrimitives({})
    const module = factory((specifier: string) => {
      if (specifier === 'react') {
        return { createElement: () => null, useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: undefined }), useCallback: (fn: unknown) => fn }
      }
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })

    expect(module.inject).toEqual(['slots', 'locale', 'remote', 'remote.credentials', 'configForms'])
    module.apply(harness.ctx)

    expect(harness.registered).toHaveLength(1)
    expect(harness.registered[0]?.name).toBe('plugins.row.config')
    expect(harness.registered[0]?.key).toBe('@anysearch/anysearch-dsh#web-search-anysearch')
    const dictionary = dictionaries[0] as { zh?: Record<string, string>; en?: Record<string, string> }
    expect(Object.keys(dictionary.zh ?? {}).sort()).toEqual(Object.keys(dictionary.en ?? {}).sort())
    // A translation that silently kept Chinese leaks into the English UI; the key
    // sets matching is not enough to catch it.
    for (const [key, text] of Object.entries(dictionary.en ?? {})) {
      expect(text, `en/${key}`).not.toMatch(/[\u4e00-\u9fff]/)
    }
    expect(dictionary.zh?.apiKeyHint).toContain('{ref}')
    expect(dictionary.en?.apiKeyHint).toContain('{ref}')
  })

  it('writes the reference the row configuration names, not a constant', async () => {
    const { factory } = loadArtifact()
    const captured: { hint?: string; stateLabel?: string } = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown

    // The host interpolates `{ref}` before the page ever sees the string, so the
    // shim must do the same: interpolating it here is what proves the page passed
    // the row's reference into the template.
    const zh = (dictionaries[0] as { zh: Record<string, string> }).zh
    const t = (key: string, params?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
        params?.[name] === undefined ? whole : String(params[name]),
      )
    const actions = {
      t,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async () => {},
      clearKey: async () => {},
    }

    // A row that names its own reference: the page must follow it.
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } }, ...actions })
    expect(captured.hint).toContain('CUSTOM_REF')
    expect(captured.hint).not.toContain('{ref}')

    // A row that names none falls back to the shared default the provider uses.
    for (const value of ['', '   ', undefined]) {
      await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: value } } }, ...actions })
      expect(captured.hint).toContain('ANYSEARCH_API_KEY')
    }
  })

  it('reads a live reference through get(), the way the loader hands it over', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const zh = (dictionaries[0] as { zh: Record<string, string> }).zh
    const t = (key: string, params?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
        params?.[name] === undefined ? whole : String(params[name]),
      )
    const actions = {
      t,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async () => {},
      clearKey: async () => {},
    }

    // A volatile field does not arrive as a string: it arrives as something with
    // `get()`, and reading the field instead of the value would manage the wrong
    // reference ("[object Object]") for every row that configures one.
    let current = 'LIVE_REF'
    const live = { get: () => current }
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: live } } }, ...actions })
    expect(captured.hint).toContain('LIVE_REF')

    current = 'LIVE_REF_REPOINTED'
    await renderUntilSettled(component, { view: 'page', form: { state: { value: { apiKeyEnv: live } } }, ...actions })
    expect(captured.hint).toContain('LIVE_REF_REPOINTED')
  })

  it('issues no credential read for a summary render', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const described: string[] = []

    await renderUntilSettled(component, {
      view: 'summary',
      form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } },
      t: (key: string) => key,
      describe: async (ref: string) => {
        described.push(ref)
        return { configured: false, writable: true }
      },
      setKey: async () => {},
      clearKey: async () => {},
    })

    // The detail page asks for one line of copy; a credential round-trip per
    // summary is invisible work with a visible failure mode (a stray error notice
    // on a page that shows no field).
    expect(described).toEqual([])
  })

  it('keeps the field editable when the state read fails, and reports the failure', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown

    await renderUntilSettled(component, {
      view: 'page',
      form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } },
      t: (key: string) => key,
      describe: async () => {
        throw new Error('credentials plane is down')
      },
      setKey: async () => {},
      clearKey: async () => {},
    })

    // A failed read knows nothing about writability. Locking the field would leave
    // the page permanently dead on a transient read failure, when a write is
    // exactly what would report the real refusal.
    expect(captured.disabled).toBe(false)
  })

  it('puts the group in one card with the actions after it, Clear only when a key is configured', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const harness = createContext_([])
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const props = {
      view: 'page' as const,
      form: { state: { value: { apiKeyEnv: 'CUSTOM_REF' } } },
      t: (key: string) => key,
      describe: async () => ({ configured: true, writable: true }),
      setKey: async () => {},
      clearKey: async () => {},
    }

    const tree = await renderUntilSettled(component, props, 8)
    const text = JSON.stringify(tree)
    // The native card contract: one card per logical group, a head that names
    // the group, a sunken body that holds the editable field, and the actions
    // outside the card. The tree carries roles only — every colour, radius and
    // border lives in the sheet asserted by the next test.
    expect(text).toContain('"anysearch-page"')
    expect(text).toContain('"anysearch-card"')
    expect(text).toContain('"anysearch-card-head"')
    expect(text).toContain('"anysearch-card-title"')
    expect(text).toContain('"anysearch-card-body"')
    expect(text).toContain('credentialGroup')
    // Save is the native primary button; Clear is the quiet 12px text action the
    // native reset uses, so it does not read as a peer of Save.
    const saveLabels = (captured.buttons ?? []).map((button) => JSON.stringify(button.children))
    expect(saveLabels).toHaveLength(1)
    expect(saveLabels[0]).toContain('save')
    expect(text).toContain('anysearch-text-button')
    expect(text).toContain('"clear"')
  })

  it('saves into the reference the field was showing when Save was pressed', async () => {
    const { factory } = loadArtifact()
    const captured: Parameters<typeof createPrimitives>[0] = {}
    const primitives = createPrimitives(captured)
    const module = factory((specifier: string) => {
      if (specifier === 'react') return reactShim
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected specifier: ${specifier}`)
    })
    const dictionaries: Record<string, unknown>[] = []
    const harness = createContext_(dictionaries)
    module.apply(harness.ctx)
    const component = harness.registered[0]?.component as (props: Record<string, unknown>) => unknown
    const written: Array<[string, string]> = []
    const props = {
      view: 'page' as const,
      form: { state: { value: { apiKeyEnv: 'OLD_REF' } } },
      t: (key: string) => key,
      describe: async () => ({ configured: false, writable: true }),
      setKey: async (ref: string, value: string) => {
        written.push([ref, value])
      },
      clearKey: async () => {},
    }

    // One mount, continued: type, then re-point the row, then press the Save the
    // earlier render painted. Save is the first button of the composed action row.
    const hooks: unknown[] = []
    await renderUntilSettled(component, props, 8, hooks)
    captured.onEdit?.('as_sk_typed')
    await renderUntilSettled(component, props, 8, hooks)
    const saveUnderOldReference = captured.buttons?.[0]?.onClick
    const repointed = { ...props, form: { state: { value: { apiKeyEnv: 'NEW_REF' } } } }
    await renderUntilSettled(component, repointed, 8, hooks)
    saveUnderOldReference?.()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The row re-pointed while that text was staged. The write goes to the
    // reference the user was shown when they pressed Save — never to the one that
    // replaced it — because that is the credential they meant to overwrite.
    expect(written).toEqual([['OLD_REF', 'as_sk_typed']])
  })

  it('reports the live native provider selection and the layer that names it', async () => {
    const { tree, captured } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: {
        status: 'ready',
        value: { searchProvider: 'deepseek-official', fetchProvider: 'http' },
        base: { searchProvider: 'anysearch', fetchProvider: 'anysearch' },
        user: { searchProvider: 'deepseek-official' },
        revision: 4,
        writable: true,
      },
    })
    const text = JSON.stringify(tree)
    // Values come from the Host form, not from the profile file: the page cannot
    // drift from what the native tools actually resolve.
    expect(text).toContain('deepseek-official')
    expect(text).toContain('"http"')
    // The section names the layer that wins, so a profile override that pins the
    // official provider is visible instead of looking like the plugin's default.
    expect(text).toContain('webSourceProfile')
    expect(text).toContain('webSourceOther')
    // The harness renders function components eagerly and this Button paints
    // null, so the label is asserted on the captured prop, not in the tree.
    expect(JSON.stringify(captured.buttonText)).toContain('webSourceSwitch')
    expect(captured.buttonOnClick).toBeTypeOf('function')
    // The status surface is the same card as the configuration surface: a head
    // with the title and the 28px action, and a sunken body holding one lead
    // line, a facts grid of native dl rows, and one note.
    expect(text).toContain('"anysearch-card"')
    expect(text).toContain('"anysearch-status-head"')
    expect(text).toContain('"anysearch-status-title"')
    expect(text).toContain('"anysearch-status-action"')
    expect(text).toContain('"anysearch-card-body"')
    expect(text).toContain('"anysearch-lead"')
    expect(text).toContain('"anysearch-facts"')
    expect(text).toContain('"anysearch-status-note"')
    // Facts are native description-list rows: the grid needs one wrapper per
    // pair, so a dt/dd piling into the label column cannot happen.
    expect(text).toContain('"dt"')
    expect(text).toContain('"dd"')
  })

  it('switches to AnySearch, clearing the override when the bundle already names it', async () => {
    const calls: unknown[][] = []
    const { captured } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: {
        status: 'ready',
        value: { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' },
        base: { searchProvider: 'anysearch', fetchProvider: 'anysearch' },
        writable: true,
      },
      mutate: async (ops) => {
        calls.push(ops)
        return true
      },
    })
    captured.buttonOnClick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The native Web-search switch clears an override whose value equals the
    // composed one instead of storing a copy, so this writes unsets — one atomic
    // mutation, both fields, same revision fence.
    expect(calls).toEqual([[
      { op: 'unset', path: ['searchProvider'] },
      { op: 'unset', path: ['fetchProvider'] },
    ]])
  })

  it('restores the native Search API pair in one mutation', async () => {
    const calls: unknown[][] = []
    const { captured } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: {
        status: 'ready',
        value: { searchProvider: 'anysearch', fetchProvider: 'anysearch' },
        base: { searchProvider: 'anysearch', fetchProvider: 'anysearch' },
        writable: true,
      },
      mutate: async (ops) => {
        calls.push(ops)
        return true
      },
    })
    // Pointing at AnySearch: the same button reverses, writing the pair the
    // native switch itself uses (its own PROVIDERS constant), not a guessed
    // per-deployment id.
    expect(JSON.stringify(captured.buttonText)).toContain('webSourceRestore')
    captured.buttonOnClick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([[
      { op: 'set', path: ['searchProvider'], value: 'deepseek-search-api' },
      { op: 'set', path: ['fetchProvider'], value: 'deepseek-fetch-api' },
    ]])
  })

  it('reports a refused write instead of claiming the switch', async () => {
    const { section, hooks, captured } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: { status: 'ready', value: { searchProvider: 'deepseek-official' }, writable: true },
      mutate: async () => false,
    })
    captured.buttonOnClick?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const tree = await renderUntilSettled(section, { subject: { pkg: '@anysearch/anysearch-dsh' } }, 8, hooks)
    // A version conflict is a refusal, not a success: the Host re-read and the
    // copy says the configuration may have moved.
    expect(JSON.stringify(tree)).toContain('webSourceRefused')
  })

  it('keeps the card read-only when the shared form cannot write', async () => {
    const { tree, captured } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: { status: 'ready', value: {}, writable: false },
    })
    expect(JSON.stringify(tree)).toContain('webSourceReadOnly')
    expect(captured.buttonOnClick).toBeUndefined()
  })

  it('says so when no web entry is served, and stays silent on another plugin page', async () => {
    // Our own page without the seam: a readable line beats an empty render —
    // otherwise a missing form looks exactly like a card that was never built.
    const absent = await renderWebSource({ namespaces: [] })
    expect(JSON.stringify(absent.tree)).toContain('webSourceUnavailable')

    const elsewhere = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      subject: 'someone-else',
    })
    expect(elsewhere.tree).toBeNull()
  })

  it('asks the settings mirror to load before it reports the provider state', async () => {
    // The mirror reads nothing until someone asks. Discovery cannot call `get()`
    // before it knows the entry id, so the card must ask the mirror itself —
    // without this it reported "unavailable" on every deployment.
    const { forms } = await renderWebSource({
      namespaces: [{ ns: 'web', schema: WEB_SCHEMA }],
      snapshot: {
        status: 'ready',
        value: { searchProvider: 'deepseek-official', fetchProvider: 'http' },
        writable: true,
      },
    })
    expect(forms.ensures).toBeGreaterThan(0)
  })

  it('shows the loading copy until the mirror holds its first document', async () => {
    const { tree } = await renderWebSource({ viewLoaded: false, status: 'loading' })
    // A read in flight is a different fact from a missing seam, and the copy
    // must not collapse the two.
    expect(JSON.stringify(tree)).toContain('webSourceLoading')
  })

  it('finds the web entry from its live values when the schema envelope is absent', async () => {
    // The second, independent identifier: a deployment that omits `schema`
    // still names the entry by its resolved value keys.
    const { tree } = await renderWebSource({
      namespaces: [{ ns: 'web', value: { searchProvider: 'deepseek-official', fetchProvider: 'http' } }],
      snapshot: {
        status: 'ready',
        value: { searchProvider: 'deepseek-official', fetchProvider: 'http' },
        writable: true,
      },
    })
    expect(JSON.stringify(tree)).toContain('deepseek-official')
  })
})
