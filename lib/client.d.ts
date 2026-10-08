/** Shared HTTP client for every AnySearch provider and tool operation. */
import type { AnySearchDomainsResponse, AnySearchExtractRequest, AnySearchExtractResponse, AnySearchSearchRequest, AnySearchSearchResponse, AnySearchSubDomainsResponse } from './types.ts';
export { ANYSEARCH_DSH_CLIENT_ID } from './version.ts';
/** Public AnySearch API origin. */
export declare const ANYSEARCH_DEFAULT_BASE_URL = "https://api.anysearch.com";
/** AnySearch operation names retained in safe diagnostics. */
export type AnySearchOperation = 'search' | 'extract' | 'domains' | 'sub_domains';
/** Resolved AnySearch client configuration. */
export interface AnySearchClientOptions {
    /** Resolve the API key for one operation; `undefined` uses anonymous access. */
    resolveApiKey: () => Promise<string | undefined>;
    /** Credential reference whose literal value must never be sent as an API key. */
    apiKeyReference?: string;
    /** API base URL; public paths are appended to its pathname. */
    baseURL: string;
}
/** Safe HTTP and credential failure surfaced by the shared client. */
export declare class AnySearchClientError extends Error {
    /** Failure category used by Harness adapters. */
    readonly kind: 'aborted' | 'provider';
    /** Operation that failed. */
    readonly operation: AnySearchOperation;
    /** Upstream HTTP status when a response arrived. */
    readonly httpStatus?: number;
    /** Authentication mode used for an upstream response. */
    readonly authentication?: 'anonymous' | 'credential';
    /** AnySearch request id when the response supplied one. */
    readonly requestId?: string;
    /** Upstream retry delay retained for diagnostics; the client never retries. */
    readonly retryAfter?: string;
    /** Stable AnySearch business error code when the response supplied one. */
    readonly errorCode?: string;
    constructor(message: string, options: {
        kind?: 'aborted' | 'provider';
        operation: AnySearchOperation;
        httpStatus?: number;
        authentication?: 'anonymous' | 'credential';
        requestId?: string;
        retryAfter?: string;
        errorCode?: string;
        cause?: unknown;
    });
}
/** HTTP client shared by the native Provider and AnySearch-specific tools. */
export declare class AnySearchClient {
    private readonly options;
    constructor(options: AnySearchClientOptions);
    /** Whether the configured base URL can produce public HTTP endpoints. */
    available(): boolean;
    /** Execute one search and validate its complete response. */
    search(request: AnySearchSearchRequest, signal?: AbortSignal): Promise<AnySearchSearchResponse>;
    /** Extract and validate the cleaned content of one public HTTP(S) URL. */
    extract(request: AnySearchExtractRequest, signal?: AbortSignal): Promise<AnySearchExtractResponse>;
    /** List all top-level domains in the dynamic capability catalog. */
    listDomains(signal?: AbortSignal): Promise<AnySearchDomainsResponse>;
    /** Read detailed capabilities for the supplied ordered domain names. */
    getSubDomains(domains: readonly string[], signal?: AbortSignal): Promise<AnySearchSubDomainsResponse>;
    private request;
    private resolveApiKey;
}
