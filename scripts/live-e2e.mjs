/** Opt-in assembled-plugin E2E against the public AnySearch API. */

import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
  ANYSEARCH_CAPABILITIES_TOOL_NAME,
  ANYSEARCH_DSH_CLIENT_ID,
  ANYSEARCH_PROVIDER_ID,
  ANYSEARCH_SEARCH_TOOL_NAME,
} from '../lib/index.js'
import * as anySearchPlugin from '../lib/index.js'

if (process.env.ANYSEARCH_E2E !== '1') {
  process.stdout.write('SKIP live AnySearch e2e: set ANYSEARCH_E2E=1 to enable network calls\n')
  process.exit(0)
}

const anonymousOnly = process.env.ANYSEARCH_E2E_ANONYMOUS === '1'
const apiKey = anonymousOnly ? undefined : process.env.ANYSEARCH_API_KEY?.trim()
if (!anonymousOnly && (apiKey === undefined || apiKey.length === 0)) {
  process.stdout.write('SKIP live AnySearch e2e: ANYSEARCH_API_KEY is not configured\n')
  process.exit(0)
}

class LiveCredentials extends Service {
  values = new Map()
  resolvedRefs = []

  constructor(ctx) {
    super(ctx, 'credentials')
  }

  resolve(ref) {
    this.resolvedRefs.push(ref)
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'live-e2e-memory' })
  }

  describe(ref) {
    return Promise.resolve({ configured: this.values.has(ref), source: 'live-e2e-memory', writable: true })
  }

  set(ref, value) {
    this.values.set(ref, value)
    return Promise.resolve()
  }

  unset(ref) {
    this.values.delete(ref)
    return Promise.resolve()
  }
}

const realFetch = globalThis.fetch
const observedRequests = []
globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers)
  observedRequests.push({
    url: String(input),
    authenticated: headers.has('authorization'),
    client: headers.get('x-anysearch-client'),
  })
  return realFetch(input, init)
}

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
await ctx.plugin(WebRuntime, { searchProvider: ANYSEARCH_PROVIDER_ID })
await ctx.plugin(LiveCredentials)
const keyRef = credentialRef('ANYSEARCH_API_KEY')
if (apiKey !== undefined) await ctx.credentials.set(keyRef, apiKey)

const pluginFiber = await ctx.plugin(anySearchPlugin, {
  baseURL: process.env.ANYSEARCH_BASE_URL?.trim() || 'https://api.anysearch.com',
  apiKeyEnv: keyRef,
  maxRenderedContentChars: 12_000,
})

let callCounter = 0
const call = (name, args, signal = new AbortController().signal) => ctx.tools.execute({
  callId: CallId(`live-e2e-${++callCounter}`),
  name,
  arguments: args,
  signal,
})

try {
  const assembly = await ctx.systemPrompt.assemble()
  const toolNames = assembly.tools.map(tool => tool.name)
  assert.ok(toolNames.includes(ANYSEARCH_CAPABILITIES_TOOL_NAME), 'capability tool missing from model assembly')
  assert.ok(toolNames.includes(ANYSEARCH_SEARCH_TOOL_NAME), 'advanced search tool missing from model assembly')
  assert.ok(toolNames.includes(ANYSEARCH_BATCH_SEARCH_TOOL_NAME), 'batch tool missing from model assembly')
  if (apiKey !== undefined) {
    assert.ok(!JSON.stringify(assembly).includes(apiKey), 'API key leaked into model assembly')
  }

  const providerResult = await ctx.web.search({
    query: 'DeepSeek Harness plugin architecture',
    maxResults: 1,
  })
  assert.ok(providerResult.sources.length > 0, 'native web provider returned no sources')
  assert.ok(providerResult.sources[0]?.url, 'native web provider source omitted its URL')

  const domainsResult = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {})
  assert.equal(domainsResult.isError, false, 'capability catalog tool failed')
  assert.equal(domainsResult.value?.kind, 'domains', 'capability catalog returned the wrong result kind')
  assert.ok(domainsResult.value?.requestId, 'capability catalog omitted requestId')
  assert.ok(domainsResult.value?.domains.length > 0, 'capability catalog is empty')
  assert.ok(domainsResult.content.some(block => block.type === 'text'
    && block.text.includes(`Request ID: ${domainsResult.value.requestId}`)),
  'capability catalog omitted requestId from model-visible content')

  const selected = domainsResult.value.domains.find(domain => domain.domain === 'academic')
    ?? domainsResult.value.domains[0]
  assert.ok(selected, 'capability catalog has no selectable domain')
  const detailsResult = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, { domains: [selected.domain] })
  assert.equal(detailsResult.isError, false, 'sub-domain capability tool failed')
  assert.equal(detailsResult.value?.kind, 'sub_domains', 'sub-domain catalog returned the wrong result kind')
  assert.ok(detailsResult.value?.requestId, 'sub-domain catalog omitted requestId')
  assert.ok(detailsResult.content.some(block => block.type === 'text'
    && block.text.includes(`Request ID: ${detailsResult.value.requestId}`)),
  'sub-domain catalog omitted requestId from model-visible content')
  const capability = detailsResult.value?.domains[0]?.subDomains.find(item => (
    Object.values(item.params).every(info => !info.required)
  ))
  assert.ok(capability, `domain ${selected.domain} has no capability without required params`)

  const advancedArgs = {
    query: 'retrieval augmented generation evaluation',
    maxResults: 1,
    tag: capability.subDomain,
    zone: 'intl',
    language: 'en',
    includeContent: true,
  }
  const advancedResult = await call(ANYSEARCH_SEARCH_TOOL_NAME, advancedArgs)
  assert.equal(advancedResult.isError, false, 'advanced search tool failed')
  assert.ok(advancedResult.value?.requestId, 'advanced search omitted requestId')
  assert.ok(advancedResult.value?.results.length > 0, 'advanced search returned no results')
  assert.ok(advancedResult.value.results.some(result => result.content?.length > 0),
    'advanced search returned no cleaned content')
  assert.ok(advancedResult.content.some(block => block.type === 'text'
    && block.text.includes('untrusted external data')), 'advanced search omitted the external-content warning')

  const searchTool = ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME)
  const searchCallView = searchTool?.presentCall?.(advancedArgs)
  assert.equal(searchCallView?.card, 'generic', 'advanced search call view is not generic')
  const searchResultView = searchTool?.presentResult?.(advancedArgs, {
    content: advancedResult.content,
    isError: advancedResult.isError,
    ...(advancedResult.meta === undefined ? {} : { meta: advancedResult.meta }),
  })
  assert.equal(searchResultView?.card, 'web', 'advanced search result view is not a web card')

  const successfulBatch = await call(ANYSEARCH_BATCH_SEARCH_TOOL_NAME, {
    items: anonymousOnly
      ? [{ query: 'agent harness observability', maxResults: 1 }]
      : [
          { query: 'agent harness observability', maxResults: 1 },
          { query: 'retrieval augmented generation benchmark', maxResults: 1 },
        ],
  })
  assert.equal(successfulBatch.isError, false, 'all-success batch tool call failed')
  const successfulBatchSize = anonymousOnly ? 1 : 2
  assert.deepEqual(successfulBatch.value?.summary, {
    total: successfulBatchSize,
    succeeded: successfulBatchSize,
    failed: 0,
  })
  assert.deepEqual(successfulBatch.value?.items.map(item => item.index),
    Array.from({ length: successfulBatchSize }, (_, index) => index),
    'all-success batch did not preserve input order')
  assert.ok(successfulBatch.value?.items.every(item => item.ok && item.requestId),
    'all-success batch omitted a successful requestId')

  if (!anonymousOnly) {
    const partialBatch = await call(ANYSEARCH_BATCH_SEARCH_TOOL_NAME, {
      items: [
        { query: 'DeepSeek Harness', maxResults: 1 },
        { query: 'expected failure', maxResults: 1, tag: '__anysearch_dsh_invalid_tag__' },
      ],
    })
    assert.equal(partialBatch.isError, false, 'partial-failure batch failed as a whole')
    assert.deepEqual(partialBatch.value?.summary, { total: 2, succeeded: 1, failed: 1 })
    assert.equal(partialBatch.value?.items[0]?.ok, true, 'partial batch lost its successful item')
    assert.equal(partialBatch.value?.items[1]?.ok, false, 'partial batch did not retain its failed item')
    assert.equal(partialBatch.value?.items[1]?.error.httpStatus, 400, 'invalid tag did not return HTTP 400')
    assert.ok(partialBatch.value?.items.every(item => item.ok ? item.requestId : item.error.requestId),
      'partial batch omitted an item requestId')
  }
  assert.equal(ctx.tools.get(ANYSEARCH_BATCH_SEARCH_TOOL_NAME)?.presentCall?.({
    items: [{ query: 'one' }, { query: 'two' }],
  })?.card, 'generic', 'batch call view is not generic')

  const beforeCancellation = observedRequests.length
  const cancelled = new AbortController()
  cancelled.abort(new Error('expected live E2E cancellation'))
  const cancelledResult = await call(ANYSEARCH_BATCH_SEARCH_TOOL_NAME, {
    items: [{ query: 'cancel one' }, { query: 'cancel two' }],
  }, cancelled.signal)
  assert.equal(cancelledResult.isError, true, 'pre-cancelled batch did not return a tool error')
  assert.equal(observedRequests.length, beforeCancellation, 'pre-cancelled batch sent HTTP requests')

  if (apiKey !== undefined) {
    assert.ok(observedRequests.every(request => request.authenticated),
      'an authenticated operation omitted Authorization')
    await ctx.credentials.unset(keyRef)
    const anonymousRequestIndex = observedRequests.length
    let anonymousResult
    let anonymousError
    try {
      anonymousResult = await ctx.web.search({ query: 'anonymous quota smoke', maxResults: 1 })
    } catch (error) {
      anonymousError = error
    } finally {
      await ctx.credentials.set(keyRef, apiKey)
    }
    assert.equal(observedRequests[anonymousRequestIndex]?.authenticated, false,
      'credential removal did not remove Authorization from the next operation')
    if (anonymousError === undefined) {
      assert.ok(anonymousResult.sources.length > 0,
        'credential removal did not fall back to anonymous search')
    } else {
      assert.equal(anonymousError.cause?.authentication, 'anonymous',
        'credential removal failed with a non-anonymous error')
      assert.equal(anonymousError.cause?.httpStatus, 402,
        'credential removal hit an unexpected anonymous API error')
    }
  } else {
    assert.ok(observedRequests.every(request => !request.authenticated),
      'anonymous-only E2E unexpectedly sent Authorization')
  }

  assert.ok(observedRequests.every(request => request.client === ANYSEARCH_DSH_CLIENT_ID),
    'an operation omitted the versioned AnySearch client identifier')
  assert.ok(ctx.credentials.resolvedRefs.length >= observedRequests.length,
    'operations did not resolve their credential references')
  assert.ok(ctx.credentials.resolvedRefs.every(ref => ref === keyRef),
    'an operation resolved an unexpected credential reference')

  await pluginFiber.dispose()
  assert.equal(ctx.tools.get(ANYSEARCH_CAPABILITIES_TOOL_NAME), undefined,
    'capability tool remained registered after plugin disposal')
  assert.equal(ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME), undefined,
    'advanced search tool remained registered after plugin disposal')
  assert.equal(ctx.tools.get(ANYSEARCH_BATCH_SEARCH_TOOL_NAME), undefined,
    'batch tool remained registered after plugin disposal')
  await assert.rejects(ctx.web.search({ query: 'after disposal' }),
    error => error?.code === 'WEB_PROVIDER_CONFIGURED_MISSING')

  process.stdout.write(
    `PASS live AnySearch plugin e2e (${anonymousOnly ? 'anonymous' : 'authenticated'}): `
      + `provider + catalog + ${capability.subDomain} + successful batch`
      + `${anonymousOnly ? '' : ' + partial batch'} + cancellation + lifecycle\n`,
  )
} finally {
  globalThis.fetch = realFetch
}
