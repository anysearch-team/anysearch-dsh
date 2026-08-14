import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  credentialRef,
  type CredentialInfo,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type JsonValue, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  ANYSEARCH_CAPABILITIES_TOOL_NAME,
  ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
  ANYSEARCH_PROVIDER_ID,
  ANYSEARCH_SEARCH_TOOL_NAME,
} from '../src/index.ts'
import * as anySearchPlugin from '../src/index.ts'
import { parseAdvancedSearchArgs } from '../src/tools/search.ts'
import { ANYSEARCH_TOOL_TIMEOUT_MS } from '../src/limits.ts'

const signal = new AbortController().signal

class MemoryCredentials extends Service {
  private readonly values = new Map<CredentialRef, string>()

  constructor(ctx: Context) {
    super(ctx, 'credentials')
  }

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.values.has(ref), writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    return Promise.resolve()
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

async function mount(config: anySearchPlugin.Config = {}): Promise<{
  ctx: Context
  fiber: Awaited<ReturnType<Context['plugin']>>
  call(name: string, args: unknown, callSignal?: AbortSignal): Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(WebRuntime, { searchProvider: ANYSEARCH_PROVIDER_ID })
  await ctx.plugin(MemoryCredentials)
  const fiber = await ctx.plugin(anySearchPlugin, {
    baseURL: 'https://api.anysearch.test',
    ...config,
  })
  let counter = 0
  return {
    ctx,
    fiber,
    call: (name, args, callSignal = signal) => ctx.tools.execute({
      callId: CallId(`call-${++counter}`),
      name,
      arguments: args,
      signal: callSignal,
    }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('anysearch_capabilities', () => {
  it('lists domains when the model supplies no filter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      request_id: 'req_domains',
      data: {
        domains: [{ domain: 'finance', description: 'Financial data', sub_domain_count: 2 }],
      },
    })))
    const { fiber, call } = await mount()

    const result = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {})

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      kind: 'domains',
      requestId: 'req_domains',
      domains: [{ domain: 'finance', description: 'Financial data', subDomainCount: 2 }],
    })
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Available AnySearch domains:\nRequest ID: req_domains\n- finance (2 sub-domains): Financial data',
    }])
    await fiber.dispose()
  })

  it('trims and deduplicates requested domains while keeping first order', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      data: { domains: [] },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()

    const result = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {
      domains: [' finance ', 'legal', 'finance'],
    })

    expect(result.isError).toBe(false)
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anysearch.test/v1/sub-domains?domain=finance&domain=legal')
    await fiber.dispose()
  })

  it('returns validated sub-domain parameters for the next search call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      request_id: 'req_subdomains',
      data: {
        domains: [{
          domain: 'finance',
          description: 'Financial data',
          sub_domains: [{
            sub_domain: 'finance.us_stock',
            description: 'US stocks',
            params: {
              ticker: { description: 'Ticker symbol', required: true, sort_order: 1 },
            },
          }],
        }],
      },
    })))
    const { fiber, call } = await mount()

    const result = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, { domains: ['finance'] })

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      kind: 'sub_domains',
      requestId: 'req_subdomains',
      domains: [{
        domain: 'finance',
        description: 'Financial data',
        subDomains: [{
          subDomain: 'finance.us_stock',
          description: 'US stocks',
          params: {
            ticker: { description: 'Ticker symbol', required: true, sortOrder: 1 },
          },
        }],
      }],
    })
    expect(result.content).toEqual([{
      type: 'text',
      text: [
        'AnySearch vertical capabilities:',
        'Request ID: req_subdomains',
        '- finance: Financial data',
        '  - finance.us_stock: US stocks',
        '    - ticker (required): Ticker symbol',
        'Use the exact sub-domain as anysearch_search.tag and pass only declared params.',
      ].join('\n'),
    }])
    await fiber.dispose()
  })

  it('rejects empty, blank, or oversized domain lists before HTTP', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()

    for (const domains of [[], ['  '], ['a', 'b', 'c', 'd', 'e', 'f']]) {
      const result = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, { domains })
      expect(result.isError).toBe(true)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    await fiber.dispose()
  })
})

describe('anysearch_search', () => {
  it('omits unrequested canonical content while rendering a concise source list', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      request_id: 'req_search',
      data: {
        results: [{
          title: 'AAPL',
          url: 'https://finance.test/aapl',
          snippet: 'Latest quote',
          content: 'FULL_CONTENT_MUST_STAY_CANONICAL',
        }],
        metadata: { total_results: 1, search_time_ms: 25 },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, fiber, call } = await mount()
    await ctx.credentials.set(credentialRef('ANYSEARCH_API_KEY'), 'as_sk_managed')

    const result = await call(ANYSEARCH_SEARCH_TOOL_NAME, {
      query: 'AAPL quote',
      maxResults: 5,
      tag: 'finance.us_stock',
      params: { ticker: 'AAPL', adjusted: true },
      zone: 'intl',
      language: 'en',
    })

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      requestId: 'req_search',
      results: [{
        title: 'AAPL',
        url: 'https://finance.test/aapl',
        snippet: 'Latest quote',
      }],
      metadata: { totalResults: 1, searchTimeMs: 25 },
      renderedContentTruncated: false,
    })
    const rendered = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(rendered).toContain('[AAPL](https://finance.test/aapl) — Latest quote')
    expect(rendered).not.toContain('FULL_CONTENT_MUST_STAY_CANONICAL')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({ authorization: 'Bearer as_sk_managed' })
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'AAPL quote',
      max_results: 5,
      tag: 'finance.us_stock',
      params: { ticker: 'AAPL', adjusted: true },
      zone: 'intl',
      language: 'en',
    })

    expect(result.meta).toEqual({
      sources: [{ url: 'https://finance.test/aapl', title: 'AAPL', snippet: 'Latest quote' }],
      truncated: false,
    })
    const view = ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME)?.presentResult?.(
      { query: 'AAPL quote' },
      { content: result.content, isError: result.isError, ...result.meta === undefined ? {} : { meta: result.meta } },
    )
    expect(view).toMatchObject({ card: 'web', kind: 'search', title: 'AAPL quote' })
    await fiber.dispose()
  })

  it('caps rendered content independently of the larger canonical budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      data: {
        results: [{ title: 'A', url: 'https://a.test', content: '123456789' }],
        metadata: { total_results: 1, search_time_ms: 1 },
      },
    })))
    const { fiber, call } = await mount({ maxRenderedContentChars: 5 })

    const result = await call(ANYSEARCH_SEARCH_TOOL_NAME, {
      query: 'q',
      includeContent: true,
    })

    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      results: [{ content: '123456789' }],
      renderedContentTruncated: true,
    })
    const rendered = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(rendered).toContain('12345')
    expect(rendered).not.toContain('123456')
    expect(rendered).toContain('Content truncated at 5 characters.')
    await fiber.dispose()
  })

  it('rejects constraints the schema cannot express before HTTP', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()
    const invalid = [
      { query: '   ' },
      { query: 'q', maxResults: 0 },
      { query: 'q', maxResults: 21 },
      { query: 'q', tag: ' ' },
      { query: 'q', language: ' ' },
      { query: 'q', params: { nested: ['not', 'scalar'] } },
    ]

    for (const args of invalid) {
      expect((await call(ANYSEARCH_SEARCH_TOOL_NAME, args)).isError).toBe(true)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('preserves special parameter names without changing the parsed object prototype', () => {
    const params = JSON.parse('{"__proto__":"literal","constructor":true}') as Record<string, JsonValue>

    const parsed = parseAdvancedSearchArgs({ query: 'q', params })

    expect(Object.getPrototypeOf(parsed.request.params)).toBeNull()
    expect(parsed.request.params).toEqual(params)
  })
})

describe('AnySearch tool registration', () => {
  it('matches the keyless assembled model-tool snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/domains')) {
        return jsonResponse({
          code: 0,
          message: 'success',
          request_id: 'req_snapshot_domains',
          data: { domains: [{ domain: 'academic', description: 'Academic resources', sub_domain_count: 1 }] },
        })
      }
      const query = (JSON.parse(init.body as string) as { query: string }).query
      return jsonResponse({
        code: 0,
        message: 'success',
        request_id: 'req_snapshot_search',
        data: {
          results: [{
            title: 'Snapshot result',
            url: 'https://example.test/paper',
            snippet: `Result for ${query}`,
            content: 'Deterministic cleaned content.',
          }],
          metadata: { total_results: 1, search_time_ms: 12 },
        },
      })
    }))
    const { ctx, fiber, call } = await mount()
    const assembly = await ctx.systemPrompt.assemble()
    const capabilities = await call(ANYSEARCH_CAPABILITIES_TOOL_NAME, {})
    const batch = await call(ANYSEARCH_BATCH_SEARCH_TOOL_NAME, {
      items: [{ query: 'retrieval evaluation', includeContent: true }],
    })
    const snapshot = {
      tools: assembly.tools.filter(tool => tool.name.startsWith('anysearch_')),
      transcript: [
        { name: ANYSEARCH_CAPABILITIES_TOOL_NAME, value: capabilities.value, content: capabilities.content },
        { name: ANYSEARCH_BATCH_SEARCH_TOOL_NAME, value: batch.value, content: batch.content },
      ],
    }

    await expect(`${JSON.stringify(snapshot, null, 2)}\n`)
      .toMatchFileSnapshot('./snapshots/keyless-assembly.txt')
    await fiber.dispose()
  })

  it('publishes both schemas and removes both tools with the plugin fiber', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      code: 0,
      message: 'success',
      data: { domains: [] },
    })))
    const { ctx, fiber } = await mount()

    expect(ctx.tools.get(ANYSEARCH_CAPABILITIES_TOOL_NAME)).toBeDefined()
    expect(ctx.tools.get(ANYSEARCH_BATCH_SEARCH_TOOL_NAME)).toBeDefined()
    expect(ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME)).toBeDefined()
    expect(ctx.tools.get(ANYSEARCH_CAPABILITIES_TOOL_NAME)?.timeoutMs).toBe(ANYSEARCH_TOOL_TIMEOUT_MS)
    expect(ctx.tools.get(ANYSEARCH_BATCH_SEARCH_TOOL_NAME)?.timeoutMs).toBe(ANYSEARCH_TOOL_TIMEOUT_MS)
    expect(ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME)?.timeoutMs).toBe(ANYSEARCH_TOOL_TIMEOUT_MS)
    const prompt = await ctx.systemPrompt.assemble()
    const names = prompt.tools.map(tool => tool.name)
    expect(names).toContain(ANYSEARCH_CAPABILITIES_TOOL_NAME)
    expect(names).toContain(ANYSEARCH_BATCH_SEARCH_TOOL_NAME)
    expect(names).toContain(ANYSEARCH_SEARCH_TOOL_NAME)

    await fiber.dispose()
    expect(ctx.tools.get(ANYSEARCH_CAPABILITIES_TOOL_NAME)).toBeUndefined()
    expect(ctx.tools.get(ANYSEARCH_BATCH_SEARCH_TOOL_NAME)).toBeUndefined()
    expect(ctx.tools.get(ANYSEARCH_SEARCH_TOOL_NAME)).toBeUndefined()
  })
})
