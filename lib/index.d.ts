/** Register AnySearch as a native Provider and model-facing advanced tools. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { ANYSEARCH_DEFAULT_BASE_URL, AnySearchClient, AnySearchClientError, } from './client.ts';
export { ANYSEARCH_DSH_CLIENT_ID, ANYSEARCH_DSH_VERSION, } from './version.ts';
export type { AnySearchClientOptions, AnySearchOperation, } from './client.ts';
export { ANYSEARCH_PROVIDER_ID, AnySearchProvider, mapAnySearchResponse, mapAnySearchResult, } from './provider.ts';
export { ANYSEARCH_FETCH_PROVIDER_ID, AnySearchFetchProvider, mapAnySearchExtractResponse, } from './fetch-provider.ts';
export { ANYSEARCH_BATCH_SEARCH_TOOL_NAME, executeBatchSearch, formatBatchSearchOutput, parseBatchSearchItems, registerBatchSearchTool, } from './tools/batch.ts';
export type { AnySearchBatchFailure, AnySearchBatchItem, AnySearchBatchOutput, AnySearchBatchSuccess, } from './tools/batch.ts';
export { ANYSEARCH_CAPABILITIES_TOOL_NAME, formatDomains, formatSubDomains, parseCapabilityDomains, registerCapabilitiesTool, } from './tools/capabilities.ts';
export { ANYSEARCH_SEARCH_TOOL_NAME, DEFAULT_MAX_RENDERED_CONTENT_CHARS, formatAdvancedSearchOutput, parseAdvancedSearchArgs, registerAdvancedSearchTool, } from './tools/search.ts';
export type { AnySearchDomainCapability, AnySearchDomainsResponse, AnySearchDomainSummary, AnySearchExtractRequest, AnySearchExtractResponse, AnySearchMetadata, AnySearchParamInfo, AnySearchParamValue, AnySearchResult, AnySearchSearchRequest, AnySearchSearchResponse, AnySearchSubDomain, AnySearchSubDomainsResponse, } from './types.ts';
/** Cordis plugin name used in loader diagnostics. */
export declare const name = "web-search-anysearch";
/** Capability seams required by the Providers and model-facing tools. */
export declare const inject: string[];
/**
 * A configuration field the loader hands over as a live reference. A `volatile`
 * field is read through `get()` so a settings write applies to the next read;
 * a plain object (a unit test, a direct caller) carries the value itself.
 */
export interface LiveConfigField<T> {
    get(): T;
}
/** AnySearch plugin configuration. */
export interface Config {
    /** Credential reference resolved for each operation. Missing values use anonymous access. */
    apiKeyEnv?: string;
    /** API base URL. Defaults to the public AnySearch API. */
    baseURL?: string;
    /** Aggregate cleaned-content characters rendered to the model by one advanced tool operation. */
    maxRenderedContentChars?: number;
}
/**
 * The config `apply` receives. `apiKeyEnv` is volatile — it rides the entry's
 * settings form, which is how the Plugins row page reads the accepted reference
 * back — so the loader hands that one field over as a live reference
 * ({@link LiveConfigField}) rather than the plain string a configuration file
 * states.
 */
export interface RunningConfig extends Omit<Config, 'apiKeyEnv'> {
    apiKeyEnv?: string | LiveConfigField<string>;
}
/** Fully validated configuration consumed by the plugin runtime. */
export interface ResolvedConfig {
    /** Non-empty credential reference resolved for every operation. */
    apiKeyEnv: string;
    /** Absolute HTTP or HTTPS API base URL. */
    baseURL: string;
    /** Aggregate cleaned-content characters rendered by one tool operation. */
    maxRenderedContentChars: number;
}
export declare const Config: z<Config, RunningConfig>;
/**
 * The credential reference in force right now: the row's `apiKeyEnv`, or the
 * default when it names none. One read, used both by validation and by every
 * operation, so the reference a key is read under and the reference it is
 * validated against are the same value even when a settings write lands mid-flight.
 */
export declare function credentialReferenceOf(config: RunningConfig): string;
/** Resolve defaults and reject self-contained configuration errors before registration. */
export declare function resolveConfig(config: RunningConfig): ResolvedConfig;
/** Register the AnySearch Provider and advanced tools with their owning services. */
export declare function apply(ctx: Context, config: RunningConfig): void;
