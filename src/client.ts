/** Shared HTTP client for every AnySearch provider and tool operation. */

import type {
  AnySearchDomainCapability,
  AnySearchDomainsResponse,
  AnySearchDomainSummary,
  AnySearchParamInfo,
  AnySearchResult,
  AnySearchSearchRequest,
  AnySearchSearchResponse,
  AnySearchSubDomain,
  AnySearchSubDomainsResponse,
} from './types.ts'
import { ANYSEARCH_DSH_CLIENT_ID } from './version.ts'

export { ANYSEARCH_DSH_CLIENT_ID } from './version.ts'

/** Public AnySearch API origin. */
export const ANYSEARCH_DEFAULT_BASE_URL = 'https://api.anysearch.com'

/** AnySearch operation names retained in safe diagnostics. */
export type AnySearchOperation = 'search' | 'domains' | 'sub_domains'

/** Resolved AnySearch client configuration. */
export interface AnySearchClientOptions {
  /** Resolve the API key for one operation; `undefined` uses anonymous access. */
  resolveApiKey: () => Promise<string | undefined>
  /** API base URL; public paths are appended to its pathname. */
  baseURL: string
}

/** Safe HTTP and credential failure surfaced by the shared client. */
export class AnySearchClientError extends Error {
  /** Failure category used by Harness adapters. */
  readonly kind: 'aborted' | 'provider'
  /** Operation that failed. */
  readonly operation: AnySearchOperation
  /** Upstream HTTP status when a response arrived. */
  readonly httpStatus?: number
  /** AnySearch request id when the response supplied one. */
  readonly requestId?: string
  /** Upstream retry delay retained for diagnostics; the client never retries. */
  readonly retryAfter?: string

  constructor(
    message: string,
    options: {
      kind?: 'aborted' | 'provider'
      operation: AnySearchOperation
      httpStatus?: number
      requestId?: string
      retryAfter?: string
      cause?: unknown
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AnySearchClientError'
    this.kind = options.kind ?? 'provider'
    this.operation = options.operation
    if (options.httpStatus !== undefined) this.httpStatus = options.httpStatus
    if (options.requestId !== undefined) this.requestId = options.requestId
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter
  }
}

interface EnvelopeData {
  data: Record<string, unknown>
  requestId?: string
}

/** HTTP client shared by the native Provider and AnySearch-specific tools. */
export class AnySearchClient {
  constructor(private readonly options: AnySearchClientOptions) {}

  /** Whether the configured base URL can produce public HTTP endpoints. */
  available(): boolean {
    return endpoint(this.options.baseURL, '/v1/search') !== undefined
  }

  /** Execute one search and validate its complete response. */
  async search(request: AnySearchSearchRequest, signal?: AbortSignal): Promise<AnySearchSearchResponse> {
    const envelope = await this.request('/v1/search', 'search', {
      method: 'POST',
      body: JSON.stringify({
        query: request.query,
        ...request.maxResults !== undefined ? { max_results: request.maxResults } : {},
        ...request.tag !== undefined ? { tag: request.tag } : {},
        ...request.params !== undefined ? { params: request.params } : {},
        ...request.zone !== undefined ? { zone: request.zone } : {},
        ...request.language !== undefined ? { language: request.language } : {},
      }),
    }, signal)
    return parseOperationData('search', envelope, parseSearchData)
  }

  /** List all top-level domains in the dynamic capability catalog. */
  async listDomains(signal?: AbortSignal): Promise<AnySearchDomainsResponse> {
    const envelope = await this.request('/v1/domains', 'domains', { method: 'GET' }, signal)
    return parseOperationData('domains', envelope, parseDomainsData)
  }

  /** Read detailed capabilities for the supplied ordered domain names. */
  async getSubDomains(domains: readonly string[], signal?: AbortSignal): Promise<AnySearchSubDomainsResponse> {
    const query = new URLSearchParams()
    for (const domain of domains) query.append('domain', domain)
    const suffix = query.toString()
    const envelope = await this.request(
      `/v1/sub-domains${suffix.length > 0 ? `?${suffix}` : ''}`,
      'sub_domains',
      { method: 'GET' },
      signal,
    )
    return parseOperationData('sub_domains', envelope, parseSubDomainsData)
  }

  private async request(
    path: string,
    operation: AnySearchOperation,
    init: { method: 'GET' | 'POST'; body?: string },
    signal?: AbortSignal,
  ): Promise<EnvelopeData> {
    const url = endpoint(this.options.baseURL, path)
    if (url === undefined) {
      throw new AnySearchClientError('AnySearch base URL is invalid', { operation })
    }

    const apiKey = await this.resolveApiKey(operation, signal)
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'user-agent': ANYSEARCH_DSH_CLIENT_ID,
      'x-anysearch-client': ANYSEARCH_DSH_CLIENT_ID,
    }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (apiKey !== undefined) headers.authorization = `Bearer ${apiKey}`

    let response: Response
    try {
      response = await fetch(url, {
        method: init.method,
        redirect: 'error',
        headers,
        ...init.body === undefined ? {} : { body: init.body },
        ...signal === undefined ? {} : { signal },
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(operation, signal, error)
      throw new AnySearchClientError(
        `AnySearch ${operation} request failed: ${String(error)}`,
        { operation, cause: error },
      )
    }

    const retryAfter = response.headers.get('retry-after') ?? undefined
    let value: unknown
    try {
      value = await response.json()
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(operation, signal, error)
      if (!response.ok) {
        throw upstreamError(operation, `API error`, response.status, undefined, retryAfter)
      }
      throw new AnySearchClientError(
        `AnySearch ${operation} returned invalid JSON: ${String(error)}`,
        {
          operation,
          httpStatus: response.status,
          ...retryAfter === undefined ? {} : { retryAfter },
          cause: error,
        },
      )
    }

    const diagnosticRequestId = optionalStringField(value, 'request_id')
    if (!response.ok) {
      const message = messageField(value) ?? 'API error'
      throw upstreamError(operation, message, response.status, diagnosticRequestId, retryAfter)
    }

    try {
      const envelope = record(value, 'response')
      const requestId = optionalStringRecordField(envelope, 'request_id', 'request_id')
      const code = numberField(envelope, 'code', 'code')
      const message = stringField(envelope, 'message', 'message')
      if (code !== 0) {
        throw upstreamError(operation, message.length > 0 ? message : `API error ${code}`, response.status, requestId, retryAfter)
      }
      return {
        data: record(envelope.data, 'data'),
        ...requestId === undefined ? {} : { requestId },
      }
    } catch (error: unknown) {
      if (error instanceof AnySearchClientError) throw error
      throw new AnySearchClientError(
        `AnySearch ${operation} returned an invalid response: ${errorMessage(error)}`,
        {
          operation,
          httpStatus: response.status,
          ...diagnosticRequestId === undefined ? {} : { requestId: diagnosticRequestId },
          ...retryAfter === undefined ? {} : { retryAfter },
          cause: error,
        },
      )
    }
  }

  private async resolveApiKey(operation: AnySearchOperation, signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted === true) throw aborted(operation, signal)
    let value: string | undefined
    try {
      value = await abortable(this.options.resolveApiKey(), signal)
    } catch (error: unknown) {
      if (isSignalAborted(signal) || isAbortError(error)) throw aborted(operation, signal, error)
      throw new AnySearchClientError(
        `AnySearch ${operation} credential resolution failed: ${String(error)}`,
        { operation, cause: error },
      )
    }
    const trimmed = value?.trim()
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
  }
}

function parseOperationData<T>(
  operation: AnySearchOperation,
  envelope: EnvelopeData,
  parse: (value: EnvelopeData) => T,
): T {
  try {
    return parse(envelope)
  } catch (error: unknown) {
    throw new AnySearchClientError(
      `AnySearch ${operation} returned an invalid response: ${errorMessage(error)}`,
      {
        operation,
        ...envelope.requestId === undefined ? {} : { requestId: envelope.requestId },
        cause: error,
      },
    )
  }
}

function endpoint(baseURL: string, path: string): string | undefined {
  try {
    const url = new URL(baseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    const [pathname, query = ''] = path.split('?', 2)
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}${pathname}`
    url.search = query.length > 0 ? `?${query}` : ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

function parseSearchData(envelope: EnvelopeData): AnySearchSearchResponse {
  const results = arrayField(envelope.data, 'results', 'data.results')
    .map((value, index) => parseSearchResult(value, index))
  const metadata = record(envelope.data.metadata, 'data.metadata')
  return {
    ...envelope.requestId === undefined ? {} : { requestId: envelope.requestId },
    results,
    metadata: {
      totalResults: nonNegativeIntegerField(metadata, 'total_results', 'data.metadata.total_results'),
      searchTimeMs: nonNegativeIntegerField(metadata, 'search_time_ms', 'data.metadata.search_time_ms'),
    },
  }
}

function parseSearchResult(value: unknown, index: number): AnySearchResult {
  const path = `data.results[${index}]`
  const result = record(value, path)
  const url = stringField(result, 'url', `${path}.url`)
  if (!URL.canParse(url)) throw new TypeError(`${path}.url must be an absolute URL`)
  const snippet = optionalStringRecordField(result, 'snippet', `${path}.snippet`)
  const content = optionalStringRecordField(result, 'content', `${path}.content`)
  return {
    title: stringField(result, 'title', `${path}.title`),
    url,
    ...snippet === undefined ? {} : { snippet },
    ...content === undefined ? {} : { content },
  }
}

function parseDomainsData(envelope: EnvelopeData): AnySearchDomainsResponse {
  const domains = arrayField(envelope.data, 'domains', 'data.domains')
    .map((value, index) => parseDomainSummary(value, index))
  return {
    ...envelope.requestId === undefined ? {} : { requestId: envelope.requestId },
    domains,
  }
}

function parseDomainSummary(value: unknown, index: number): AnySearchDomainSummary {
  const path = `data.domains[${index}]`
  const domain = record(value, path)
  return {
    domain: stringField(domain, 'domain', `${path}.domain`),
    description: stringField(domain, 'description', `${path}.description`),
    subDomainCount: nonNegativeIntegerField(domain, 'sub_domain_count', `${path}.sub_domain_count`),
  }
}

function parseSubDomainsData(envelope: EnvelopeData): AnySearchSubDomainsResponse {
  const domains = arrayField(envelope.data, 'domains', 'data.domains')
    .map((value, index) => parseDomainCapability(value, index))
  return {
    ...envelope.requestId === undefined ? {} : { requestId: envelope.requestId },
    domains,
  }
}

function parseDomainCapability(value: unknown, index: number): AnySearchDomainCapability {
  const path = `data.domains[${index}]`
  const domain = record(value, path)
  return {
    domain: stringField(domain, 'domain', `${path}.domain`),
    description: stringField(domain, 'description', `${path}.description`),
    subDomains: arrayField(domain, 'sub_domains', `${path}.sub_domains`)
      .map((item, subIndex) => parseSubDomain(item, `${path}.sub_domains[${subIndex}]`)),
  }
}

function parseSubDomain(value: unknown, path: string): AnySearchSubDomain {
  const subDomain = record(value, path)
  const paramsValue = subDomain.params === undefined ? {} : record(subDomain.params, `${path}.params`)
  const params: Record<string, AnySearchParamInfo> = {}
  for (const [name, rawInfo] of Object.entries(paramsValue)) {
    const infoPath = `${path}.params.${name}`
    const info = record(rawInfo, infoPath)
    const sortOrder = optionalNumberRecordField(info, 'sort_order', `${infoPath}.sort_order`)
    params[name] = {
      description: stringField(info, 'description', `${infoPath}.description`),
      required: booleanField(info, 'required', `${infoPath}.required`),
      ...sortOrder === undefined ? {} : { sortOrder },
    }
  }
  return {
    subDomain: stringField(subDomain, 'sub_domain', `${path}.sub_domain`),
    description: stringField(subDomain, 'description', `${path}.description`),
    params,
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function arrayField(value: Record<string, unknown>, key: string, path: string): unknown[] {
  const field = value[key]
  if (!Array.isArray(field)) throw new TypeError(`${path} must be an array`)
  return field
}

function stringField(value: Record<string, unknown>, key: string, path: string): string {
  const field = value[key]
  if (typeof field !== 'string') throw new TypeError(`${path} must be a string`)
  return field
}

function optionalStringRecordField(value: Record<string, unknown>, key: string, path: string): string | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'string') throw new TypeError(`${path} must be a string`)
  return field
}

function optionalStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

function numberField(value: Record<string, unknown>, key: string, path: string): number {
  const field = value[key]
  if (typeof field !== 'number' || !Number.isFinite(field)) throw new TypeError(`${path} must be a number`)
  return field
}

function optionalNumberRecordField(value: Record<string, unknown>, key: string, path: string): number | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'number' || !Number.isInteger(field)) throw new TypeError(`${path} must be an integer`)
  return field
}

function nonNegativeIntegerField(value: Record<string, unknown>, key: string, path: string): number {
  const field = value[key]
  if (typeof field !== 'number') throw new TypeError(`${path} must be a number`)
  if (!Number.isSafeInteger(field) || field < 0) throw new TypeError(`${path} must be a non-negative integer`)
  return field
}

function booleanField(value: Record<string, unknown>, key: string, path: string): boolean {
  const field = value[key]
  if (typeof field !== 'boolean') throw new TypeError(`${path} must be a boolean`)
  return field
}

function messageField(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const message = (value as Record<string, unknown>).message
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined
}

function upstreamError(
  operation: AnySearchOperation,
  detail: string,
  httpStatus: number,
  requestId?: string,
  retryAfter?: string,
): AnySearchClientError {
  const facts = [
    `HTTP ${httpStatus}`,
    ...requestId === undefined ? [] : [`request_id ${requestId}`],
    ...retryAfter === undefined ? [] : [`retry-after ${retryAfter}`],
  ]
  return new AnySearchClientError(
    `AnySearch ${operation} failed: ${detail} (${facts.join(', ')})`,
    {
      operation,
      httpStatus,
      ...requestId === undefined ? {} : { requestId },
      ...retryAfter === undefined ? {} : { retryAfter },
    },
  )
}

function aborted(operation: AnySearchOperation, signal?: AbortSignal, fallback?: unknown): AnySearchClientError {
  return new AnySearchClientError(`AnySearch ${operation} aborted`, {
    kind: 'aborted',
    operation,
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Race one asynchronous preflight against caller cancellation. */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(new DOMException('Aborted', 'AbortError')) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error), { cause: error }))
      },
    )
  })
}
