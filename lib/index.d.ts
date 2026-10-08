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
/** AnySearch plugin configuration. */
export interface Config {
    /** Credential reference resolved for each operation. Missing values use anonymous access. */
    apiKeyEnv?: string;
    /** API base URL. Defaults to the public AnySearch API. */
    baseURL?: string;
    /** Aggregate cleaned-content characters rendered to the model by one advanced tool operation. */
    maxRenderedContentChars?: number;
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
export declare const Config: z<Schemastery.ObjectS<{
    apiKeyEnv: z<string, string>;
    baseURL: z<string, string>;
    maxRenderedContentChars: z<number, number>;
}>, Schemastery.ObjectT<{
    apiKeyEnv: z<string, string>;
    baseURL: z<string, string>;
    maxRenderedContentChars: z<number, number>;
}>>;
/** Resolve defaults and reject self-contained configuration errors before registration. */
export declare function resolveConfig(config: Config): ResolvedConfig;
/** Register the AnySearch Provider and advanced tools with their owning services. */
export declare function apply(ctx: Context, config: Config): void;
