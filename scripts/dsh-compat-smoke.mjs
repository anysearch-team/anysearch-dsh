import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import * as llm from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as webTools from '@deepseek-ai/dsh-tool-web'
import * as plugin from '@anysearch/anysearch-dsh'

const callId = llm.ToolCallId ?? llm.CallId
assert.equal(typeof callId, 'function', 'DSH call ID constructor missing')
class Credentials extends Service {
  constructor(ctx) { super(ctx, 'credentials') }
  async resolve() { return { value: 'as_sk_compat_fixture', source: 'test' } }
}
const originalFetch = globalThis.fetch
let requests = 0
globalThis.fetch = async (url, init) => {
  assert.equal(new URL(url).origin, 'https://api.anysearch.test')
  assert.equal(new Headers(init.headers).get('authorization'), 'Bearer as_sk_compat_fixture')
  requests++
  const input = init.body ? JSON.parse(init.body) : {}
  let data
  if (url.endsWith('/v1/domains')) data = { domains: [{ domain: 'web', description: 'Web', sub_domain_count: 1 }] }
  else if (url.endsWith('/v1/extract')) data = { url: input.url, title: 'Fixture', content: 'Compatibility fixture body' }
  else if (url.endsWith('/v1/search')) data = {
    results: [{ title: 'Fixture', url: 'https://example.test/result', snippet: input.query, content: 'Fixture content' }],
    metadata: { total_results: 1, search_time_ms: 1 },
  }
  else throw new Error(`Unexpected HTTP endpoint: ${url}`)
  return new Response(JSON.stringify({ code: 0, message: 'success', request_id: 'compat', data }), {
    headers: { 'content-type': 'application/json' },
  })
}
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(WebRuntime, { searchProvider: 'anysearch', fetchProvider: 'anysearch' })
  await ctx.plugin(Credentials)
  // DSH registers native search; AnySearch fills in fetch only when absent.
  webTools.applyWebSearchTool(ctx, webTools.WEB_SEARCH_MAX_RESULTS, webTools.DEFAULT_WEB_TOOL_TIMEOUT_MS, webTools.WEB_SEARCH_MAX_QUERIES)
  const fiber = await ctx.plugin(plugin, { baseURL: 'https://api.anysearch.test' })
  const assembly = await ctx.systemPrompt.assemble()
  for (const name of ['web_search', 'web_fetch', 'anysearch_search', 'anysearch_capabilities', 'anysearch_batch_search']) {
    assert.ok(assembly.tools.some(tool => tool.name === name), `${name} absent from model schema`)
  }
  assert.ok(!JSON.stringify(assembly).includes('as_sk_compat_fixture'), 'Credential leaked into prompt')
  let counter = 0
  async function call(name, args) {
    const result = await ctx.tools.execute({ callId: callId(`compat-${++counter}`), name, arguments: args, signal: new AbortController().signal })
    assert.equal(result.isError, false, `${name}: ${JSON.stringify(result)}`)
    assert.ok(result.content.some(block => block.type === 'text' && block.text.length), `${name}: missing model output`)
    return result.value
  }
  const searchSchema = assembly.tools.find(tool => tool.name === 'web_search')
  const multiQuery = JSON.stringify(searchSchema).includes('"queries"')
  await call('web_search', multiQuery ? { queries: ['fixture one', 'fixture two'] } : { query: 'fixture' })
  const fetched = await call('web_fetch', { url: 'https://example.test/article' })
  assert.equal(fetched.body.content, 'Compatibility fixture body')
  const domains = await call('anysearch_capabilities', {})
  assert.equal(domains.domains[0].domain, 'web')
  await call('anysearch_search', { query: 'fixture', includeContent: true })
  await call('anysearch_batch_search', { items: [{ query: 'one' }, { query: 'two' }] })
  await fiber.dispose()
  for (const name of ['web_fetch', 'anysearch_search', 'anysearch_capabilities', 'anysearch_batch_search']) assert.equal(ctx.tools.get(name), undefined)
  await assert.rejects(ctx.web.search({ query: 'disposed' }), { code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
  // Also cover desktops which already provide native fetch.
  webTools.applyWebFetchTool(ctx, webTools.DEFAULT_WEB_TOOL_TIMEOUT_MS, webTools.DEFAULT_FETCH_MAX_OUTPUT_CHARS)
  const existing = ctx.tools.get('web_fetch')
  const second = await ctx.plugin(plugin, { baseURL: 'https://api.anysearch.test' })
  assert.equal(ctx.tools.get('web_fetch'), existing)
  await call('web_fetch', { url: 'https://example.test/article' })
  await second.dispose()
  assert.equal(ctx.tools.get('web_fetch'), existing)
  console.log(`PASS plugin lifecycle, five tools, credentials, native fetch reuse; ${requests} fixture HTTP requests`)
} finally {
  globalThis.fetch = originalFetch
}
