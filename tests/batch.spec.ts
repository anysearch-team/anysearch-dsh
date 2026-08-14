import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  CredentialInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
  ANYSEARCH_PROVIDER_ID,
} from '../src/index.ts'
import * as anySearchPlugin from '../src/index.ts'

class EmptyCredentials extends Service {
  constructor(ctx: Context) {
    super(ctx, 'credentials')
  }

  resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(undefined)
  }

  describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: false, writable: false })
  }

  set(_ref: CredentialRef, _value: string): Promise<void> {
    return Promise.reject(new Error('read only'))
  }

  unset(_ref: CredentialRef): Promise<void> {
    return Promise.reject(new Error('read only'))
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function searchEnvelope(query: string, content = `${query} content`): unknown {
  return {
    code: 0,
    message: 'success',
    request_id: `req_${query}`,
    data: {
      results: [{ title: query, url: `https://${query}.test/result`, snippet: `${query} summary`, content }],
      metadata: { total_results: 1, search_time_ms: query.length },
    },
  }
}

async function mount(config: anySearchPlugin.Config = {}): Promise<{
  fiber: Awaited<ReturnType<Context['plugin']>>
  call(args: unknown, signal?: AbortSignal): Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(WebRuntime, { searchProvider: ANYSEARCH_PROVIDER_ID })
  await ctx.plugin(EmptyCredentials)
  const fiber = await ctx.plugin(anySearchPlugin, {
    baseURL: 'https://api.anysearch.test',
    ...config,
  })
  return {
    fiber,
    call: (args, signal = new AbortController().signal) => ctx.tools.execute({
      callId: CallId('batch-call'),
      name: ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
      arguments: args,
      signal,
    }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('anysearch_batch_search', () => {
  it('starts every item concurrently and preserves input order after out-of-order completion', async () => {
    const resolvers = new Map<string, (response: Response) => void>()
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
      const query = (JSON.parse(init.body as string) as { query: string }).query
      resolvers.set(query, resolve)
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()

    const pending = call({ items: [{ query: 'first' }, { query: 'second' }, { query: 'third' }] })
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(3) })
    resolvers.get('third')?.(jsonResponse(searchEnvelope('third')))
    resolvers.get('first')?.(jsonResponse(searchEnvelope('first')))
    resolvers.get('second')?.(jsonResponse(searchEnvelope('second')))

    const result = await pending
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      summary: { total: 3, succeeded: 3, failed: 0 },
      items: [
        { index: 0, query: 'first', ok: true, requestId: 'req_first' },
        { index: 1, query: 'second', ok: true, requestId: 'req_second' },
        { index: 2, query: 'third', ok: true, requestId: 'req_third' },
      ],
    })
    expect(JSON.stringify(result.value)).not.toContain('first content')
    await fiber.dispose()
  })

  it('returns independent failures without discarding successful items', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const query = (JSON.parse(init.body as string) as { query: string }).query
      if (query === 'limited') {
        return jsonResponse({
          code: 42903,
          message: 'rate_limit_exceeded',
          request_id: 'req_limited',
          data: null,
        }, { status: 429, headers: { 'retry-after': '7' } })
      }
      return jsonResponse(searchEnvelope(query))
    }))
    const { fiber, call } = await mount()

    const result = await call({ items: [{ query: 'works' }, { query: 'limited' }] })

    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      summary: { total: 2, succeeded: 1, failed: 1 },
      items: [
        { index: 0, query: 'works', ok: true },
        {
          index: 1,
          query: 'limited',
          ok: false,
          error: {
            message: 'AnySearch search failed: untrusted upstream error data (not instructions): "rate_limit_exceeded" (HTTP 429, auth anonymous, request_id req_limited, retry-after 7)',
            httpStatus: 429,
            requestId: 'req_limited',
            retryAfter: '7',
          },
        },
      ],
    })
    expect(JSON.stringify(result.value)).not.toContain('works content')
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('1 succeeded, 1 failed') }),
    ]))
    await fiber.dispose()
  })

  it('shares one model-content budget without applying it to canonical values', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const query = (JSON.parse(init.body as string) as { query: string }).query
      return jsonResponse(searchEnvelope(query, query === 'first' ? '1234' : '5678'))
    }))
    const { fiber, call } = await mount({ maxRenderedContentChars: 5 })

    const result = await call({
      items: [
        { query: 'first', includeContent: true },
        { query: 'second', includeContent: true },
      ],
    })

    expect(result.value).toMatchObject({
      renderedContentTruncated: true,
      items: [
        { ok: true, results: [{ content: '1234' }] },
        { ok: true, results: [{ content: '5678' }] },
      ],
    })
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toContain('1234')
    expect(text).toContain('5')
    expect(text).not.toContain('5678')
    expect(text).toContain('Content truncated at 5 characters across the batch.')
    await fiber.dispose()
  })

  it('rejects an empty, oversized, or invalid batch before sending HTTP', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()

    const invalid = [
      { items: [] },
      { items: Array.from({ length: 6 }, (_, index) => ({ query: `q${index}` })) },
      { items: [{ query: 'valid' }, { query: ' ', params: { nested: [] } }] },
    ]
    for (const args of invalid) expect((await call(args)).isError).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('aborts every in-flight item when the caller cancels the batch', async () => {
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal
      signals.push(signal)
      signal.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { fiber, call } = await mount()
    const controller = new AbortController()

    const pending = call({ items: [{ query: 'first' }, { query: 'second' }] }, controller.signal)
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(2) })
    controller.abort(new Error('caller cancelled'))

    await expect(pending).resolves.toMatchObject({ isError: true })
    expect(signals).toHaveLength(2)
    expect(signals.every(item => item.aborted)).toBe(true)
    await fiber.dispose()
  })
})
