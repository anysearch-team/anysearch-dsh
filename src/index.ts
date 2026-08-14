/** Register AnySearch as a native Provider and model-facing advanced tools. */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-web'
import z from '@deepseek-ai/schemastery'
import {
  ANYSEARCH_DEFAULT_BASE_URL,
  AnySearchClient,
} from './client.ts'
import { AnySearchProvider } from './provider.ts'
import { registerCapabilitiesTool } from './tools/capabilities.ts'
import { registerBatchSearchTool } from './tools/batch.ts'
import {
  DEFAULT_MAX_RENDERED_CONTENT_CHARS,
  registerAdvancedSearchTool,
} from './tools/search.ts'

export {
  ANYSEARCH_DEFAULT_BASE_URL,
  AnySearchClient,
  AnySearchClientError,
} from './client.ts'
export {
  ANYSEARCH_DSH_CLIENT_ID,
  ANYSEARCH_DSH_VERSION,
} from './version.ts'
export type {
  AnySearchClientOptions,
  AnySearchOperation,
} from './client.ts'
export {
  ANYSEARCH_PROVIDER_ID,
  AnySearchProvider,
  mapAnySearchResponse,
  mapAnySearchResult,
} from './provider.ts'
export {
  ANYSEARCH_BATCH_SEARCH_TOOL_NAME,
  executeBatchSearch,
  formatBatchSearchOutput,
  parseBatchSearchItems,
  registerBatchSearchTool,
} from './tools/batch.ts'
export type {
  AnySearchBatchFailure,
  AnySearchBatchItem,
  AnySearchBatchOutput,
  AnySearchBatchSuccess,
} from './tools/batch.ts'
export {
  ANYSEARCH_CAPABILITIES_TOOL_NAME,
  formatDomains,
  formatSubDomains,
  parseCapabilityDomains,
  registerCapabilitiesTool,
} from './tools/capabilities.ts'
export {
  ANYSEARCH_SEARCH_TOOL_NAME,
  DEFAULT_MAX_RENDERED_CONTENT_CHARS,
  formatAdvancedSearchOutput,
  parseAdvancedSearchArgs,
  registerAdvancedSearchTool,
} from './tools/search.ts'
export type {
  AnySearchDomainCapability,
  AnySearchDomainsResponse,
  AnySearchDomainSummary,
  AnySearchMetadata,
  AnySearchParamInfo,
  AnySearchParamValue,
  AnySearchResult,
  AnySearchSearchRequest,
  AnySearchSearchResponse,
  AnySearchSubDomain,
  AnySearchSubDomainsResponse,
} from './types.ts'

/** Cordis plugin name used in loader diagnostics. */
export const name = 'web-search-anysearch'

/** Capability seams required by the Provider and advanced tools. */
export const inject = ['web', 'credentials', 'tools']

const DEFAULT_API_KEY_ENV = 'ANYSEARCH_API_KEY'

/** AnySearch plugin configuration. */
export interface Config {
  /** Credential reference resolved for each operation. Missing values use anonymous access. */
  apiKeyEnv?: string
  /** API base URL. Defaults to the public AnySearch API. */
  baseURL?: string
  /** Aggregate cleaned-content characters rendered to the model by one advanced tool operation. */
  maxRenderedContentChars?: number
}

/** Fully validated configuration consumed by the plugin runtime. */
export interface ResolvedConfig {
  /** Non-empty credential reference resolved for every operation. */
  apiKeyEnv: string
  /** Absolute HTTP or HTTPS API base URL. */
  baseURL: string
  /** Aggregate cleaned-content characters rendered by one tool operation. */
  maxRenderedContentChars: number
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxRenderedContentChars: z.number().step(1).min(1).default(DEFAULT_MAX_RENDERED_CONTENT_CHARS),
})

/** Resolve defaults and reject self-contained configuration errors before registration. */
export function resolveConfig(config: Config): ResolvedConfig {
  const apiKeyEnv = (config.apiKeyEnv ?? DEFAULT_API_KEY_ENV).trim()
  if (apiKeyEnv.length === 0) throw new Error('apiKeyEnv must be a non-empty credential reference')

  const baseURL = (config.baseURL ?? ANYSEARCH_DEFAULT_BASE_URL).trim()
  let parsedURL: URL
  try {
    parsedURL = new URL(baseURL)
  } catch {
    throw new Error('baseURL must be an absolute URL')
  }
  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new Error('baseURL must use HTTP or HTTPS')
  }
  if (parsedURL.username.length > 0 || parsedURL.password.length > 0) {
    throw new Error('baseURL must not contain credentials')
  }

  const maxRenderedContentChars = config.maxRenderedContentChars ?? DEFAULT_MAX_RENDERED_CONTENT_CHARS
  if (!Number.isSafeInteger(maxRenderedContentChars) || maxRenderedContentChars < 1) {
    throw new Error('maxRenderedContentChars must be a positive integer')
  }
  return { apiKeyEnv, baseURL, maxRenderedContentChars }
}

/** Register the AnySearch Provider and advanced tools with their owning services. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const apiKeyEnv = credentialRef(resolved.apiKeyEnv)
  const client = new AnySearchClient({
    resolveApiKey: async () => (await ctx.credentials.resolve(apiKeyEnv))?.value,
    apiKeyReference: resolved.apiKeyEnv,
    baseURL: resolved.baseURL,
  })
  ctx.web.registerSearchProvider(new AnySearchProvider(client))
  registerCapabilitiesTool(ctx, client)
  registerBatchSearchTool(ctx, client, resolved.maxRenderedContentChars)
  registerAdvancedSearchTool(
    ctx,
    client,
    resolved.maxRenderedContentChars,
  )
}
