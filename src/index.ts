/** Register AnySearch as a native Provider and model-facing advanced tools. */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import {
  applyWebFetchTool,
  DEFAULT_FETCH_MAX_OUTPUT_CHARS,
  DEFAULT_WEB_TOOL_TIMEOUT_MS,
} from '@deepseek-ai/dsh-tool-web'
import type {} from '@deepseek-ai/dsh-web'
import z from '@deepseek-ai/schemastery'
import {
  ANYSEARCH_DEFAULT_BASE_URL,
  AnySearchClient,
} from './client.ts'
import { AnySearchProvider } from './provider.ts'
import { AnySearchFetchProvider } from './fetch-provider.ts'
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
  ANYSEARCH_FETCH_PROVIDER_ID,
  AnySearchFetchProvider,
  mapAnySearchExtractResponse,
} from './fetch-provider.ts'
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
  AnySearchExtractRequest,
  AnySearchExtractResponse,
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

/** Capability seams required by the Providers and model-facing tools. */
export const inject = ['web', 'credentials', 'systemPrompt', 'tools']

const DEFAULT_API_KEY_ENV = 'ANYSEARCH_API_KEY'

/**
 * A configuration field the loader hands over as a live reference. A `volatile`
 * field is read through `get()` so a settings write applies to the next read;
 * a plain object (a unit test, a direct caller) carries the value itself.
 */
export interface LiveConfigField<T> {
  get(): T
}

/** AnySearch plugin configuration. */
export interface Config {
  /** Credential reference resolved for each operation. Missing values use anonymous access. */
  apiKeyEnv?: string
  /** API base URL. Defaults to the public AnySearch API. */
  baseURL?: string
  /** Aggregate cleaned-content characters rendered to the model by one advanced tool operation. */
  maxRenderedContentChars?: number
}

/**
 * The config `apply` receives. `apiKeyEnv` is volatile — it rides the entry's
 * settings form, which is how the Plugins row page reads the accepted reference
 * back — so the loader hands that one field over as a live reference
 * ({@link LiveConfigField}) rather than the plain string a configuration file
 * states.
 */
export interface RunningConfig extends Omit<Config, 'apiKeyEnv'> {
  apiKeyEnv?: string | LiveConfigField<string>
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

// The schema binding is explicit, not inferred: `z<Input, Output>` — schemastery's
// first parameter is what the schema accepts, the second what it emits
// (`Schema<S, T, Mode>`, whose call signature is `(data?: S) => SchemaOutput<T, Mode>`).
// So this pins the schema to accepting what a configuration layer states and
// emitting what `apply` receives. The order is not assumed, it is forced: a
// volatile field's output is `Volatile<string>`, which is assignable to
// `RunningConfig.apiKeyEnv` but not to `Config.apiKeyEnv`, so a reversed binding
// would not compile at all. The pin bites in the other direction too — dropping
// the live-reference union from `RunningConfig` (or adding a field the schema
// does not emit) is a type error.
export const Config: z<Config, RunningConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
  baseURL: z.string(),
  maxRenderedContentChars: z.number().step(1).min(1).default(DEFAULT_MAX_RENDERED_CONTENT_CHARS),
})

/**
 * Read the credential-reference field. The loader hands a volatile field over as
 * a live reference, whose value a settings write can change between operations;
 * a plain string (a direct caller, a configuration layer read outside the loader)
 * passes through. Deliberately not generic: the structural read is sound for
 * this one field, and the schema rejects every other type before `apply` sees it.
 * `null` is tolerated for untyped callers even though the schema never emits it.
 */
function liveValue(field: string | LiveConfigField<string> | null | undefined): string | undefined {
  if (field === undefined || field === null) return undefined
  return typeof field === 'string' ? field : field.get()
}

/**
 * The credential reference in force right now: the row's `apiKeyEnv`, or the
 * default when it names none. One read, used both by validation and by every
 * operation, so the reference a key is read under and the reference it is
 * validated against are the same value even when a settings write lands mid-flight.
 */
export function credentialReferenceOf(config: RunningConfig): string {
  const named = liveValue(config.apiKeyEnv)?.trim() ?? ''
  return named.length > 0 ? named : DEFAULT_API_KEY_ENV
}

/** Resolve defaults and reject self-contained configuration errors before registration. */
export function resolveConfig(config: RunningConfig): ResolvedConfig {
  // A blank or whitespace-only reference is not a name the provider could
  // resolve. The Plugins row page treats such a value as absent, so this half
  // does too — otherwise the GUI would manage the default while every search threw.
  const apiKeyEnv = credentialReferenceOf(config)

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
export function apply(ctx: Context, config: RunningConfig): void {
  // `apiKeyEnv` is volatile: the loader hands it over as a live reference whose
  // value a settings write can change. The credential plane is therefore read
  // per operation, and in ONE step: the reference travels with the key it was
  // read under, so a re-point that lands mid-request cannot attribute a key to
  // the wrong reference or validate it against a value that never applied. The
  // two non-volatile fields are fixed at activation, as before.
  const resolved = resolveConfig(config)
  const client = new AnySearchClient({
    resolveCredential: async () => {
      const reference = credentialReferenceOf(config)
      return { key: (await ctx.credentials.resolve(credentialRef(reference)))?.value, reference }
    },
    baseURL: resolved.baseURL,
  })
  ctx.web.registerSearchProvider(new AnySearchProvider(client))
  ctx.web.registerFetchProvider(new AnySearchFetchProvider(client))
  if (ctx.tools.get('web_fetch') === undefined) {
    applyWebFetchTool(ctx, DEFAULT_WEB_TOOL_TIMEOUT_MS, DEFAULT_FETCH_MAX_OUTPUT_CHARS)
  }
  registerCapabilitiesTool(ctx, client)
  registerBatchSearchTool(ctx, client, resolved.maxRenderedContentChars)
  registerAdvancedSearchTool(
    ctx,
    client,
    resolved.maxRenderedContentChars,
  )
}
