import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANYSEARCH_FETCH_PROVIDER_ID,
  AnySearchClient,
  AnySearchFetchProvider,
  mapAnySearchExtractResponse,
} from '../src/index.ts'
import type { AnySearchClientOptions, AnySearchExtractResponse } from '../src/index.ts'

const options: AnySearchClientOptions = {
  resolveApiKey: () => Promise.resolve('as_sk_test'),
  baseURL: 'https://api.anysearch.test',
}

function provider(clientOptions: AnySearchClientOptions = options): AnySearchFetchProvider {
  return new AnySearchFetchProvider(new AnySearchClient(clientOptions))
}

function extractResponse(overrides: Partial<AnySearchExtractResponse> = {}): AnySearchExtractResponse {
  return {
    requestId: 'req_extract',
    url: 'https://example.test/article',
    normalizedUrl: 'https://example.test/article',
    effectiveUrl: 'https://www.example.test/article',
    title: 'Example article',
    content: '# Example article\n\nCleaned body.',
    contentType: 'text/html',
    sourceHttpStatus: 200,
    truncated: false,
    returnedCharacters: 32,
    contentTrust: 'external_untrusted',
    ...overrides,
  }
}

function successEnvelope(): unknown {
  return {
    code: 0,
    message: 'success',
    request_id: 'req_extract',
    data: {
      url: 'https://example.test/article',
      normalized_url: 'https://example.test/article',
      effective_url: 'https://www.example.test/article',
      title: 'Example article',
      content: '# Example article\n\nCleaned body.',
      content_type: 'text/html',
      source_http_status: 200,
      truncated: false,
      returned_characters: 32,
      content_trust: 'external_untrusted',
    },
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AnySearch fetch result mapping', () => {
  it('returns cleaned HTML extraction as text so Harness does not convert it twice', () => {
    expect(mapAnySearchExtractResponse(extractResponse())).toEqual({
      url: 'https://www.example.test/article',
      statusCode: 200,
      body: { kind: 'text', content: '# Example article\n\nCleaned body.' },
      truncated: false,
    })
  })

  it('preserves the API truncation marker', () => {
    expect(mapAnySearchExtractResponse(extractResponse({ truncated: true })).truncated).toBe(true)
  })
})

describe('AnySearchFetchProvider', () => {
  it('uses the stable AnySearch fetch id and calls the Extract endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(successEnvelope()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().fetch({ url: 'https://example.test/article' })).resolves.toMatchObject({
      url: 'https://www.example.test/article',
      body: { kind: 'text' },
    })

    expect(provider().id).toBe(ANYSEARCH_FETCH_PROVIDER_ID)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anysearch.test/v1/extract')
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.test/article' })
  })

  it('reports invalid base URLs as unavailable', () => {
    expect(provider().available()).toBe(true)
    expect(provider({ ...options, baseURL: 'file:///tmp/api' }).available()).toBe(false)
  })

  it.each([
    ['invalid_extract_url', 'WEB_INVALID_URL'],
    ['extract_target_blocked', 'WEB_BLOCKED_URL'],
    ['extract_content_too_large', 'WEB_FETCH_TOO_LARGE'],
    ['extract_unsupported_content', 'WEB_UNSUPPORTED_CONTENT_TYPE'],
    ['extract_timeout', 'WEB_FETCH_TIMEOUT'],
    ['extract_canceled', 'WEB_ABORTED'],
    ['extract_proxy_unavailable', 'WEB_PROVIDER_ERROR'],
  ])('maps %s to %s', async (errorCode, webCode) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      code: -1,
      message: 'Safe Extract failure.',
      request_id: 'req_failed',
      error_code: errorCode,
    }, { status: 502 })))

    await expect(provider().fetch({ url: 'https://example.test/article' }))
      .rejects.toMatchObject({ code: webCode })
  })

  it('maps caller cancellation to WEB_ABORTED without sending HTTP', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))

    await expect(provider().fetch({ url: 'https://example.test/article' }, controller.signal))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
