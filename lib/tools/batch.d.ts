/** Model-facing bounded fanout over independent AnySearch search requests. */
import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '../types.ts';
import type { AnySearchClient } from '../client.ts';
import type { AnySearchMetadata, AnySearchResult, AnySearchSearchRequest } from '../types.ts';
/** Stable model-facing name for bounded client-side search fanout. */
export declare const ANYSEARCH_BATCH_SEARCH_TOOL_NAME = "anysearch_batch_search";
/** Maximum independent HTTP requests accepted by one batch operation. */
export declare const MAX_BATCH_SEARCH_ITEMS = 5;
/** Parsed batch item sent to the shared client. */
export interface AnySearchBatchItem {
    /** Validated AnySearch search request. */
    request: AnySearchSearchRequest;
    /** Whether cleaned content may enter model-visible rendering. */
    includeContent: boolean;
}
/** Successful item retained at its original input index. */
export interface AnySearchBatchSuccess {
    index: number;
    query: string;
    ok: true;
    requestId?: string;
    results: AnySearchResult[];
    metadata: AnySearchMetadata;
}
/** Failed item retained without discarding independent successes. */
export interface AnySearchBatchFailure {
    index: number;
    query: string;
    ok: false;
    error: {
        message: string;
        httpStatus?: number;
        requestId?: string;
        retryAfter?: string;
    };
}
/** Canonical ordered batch result. */
export interface AnySearchBatchOutput {
    items: Array<AnySearchBatchSuccess | AnySearchBatchFailure>;
    summary: {
        total: number;
        succeeded: number;
        failed: number;
    };
    renderedContentTruncated: boolean;
}
interface BatchToolItemArgs {
    query: string;
    maxResults?: number;
    tag?: string;
    params?: Record<string, JsonValue>;
    zone?: 'cn' | 'intl';
    language?: string;
    includeContent?: boolean;
}
/** Validate every batch item before any HTTP request begins. */
export declare function parseBatchSearchItems(items: BatchToolItemArgs[]): AnySearchBatchItem[];
/** Render ordered batch outcomes with one aggregate model-content budget. */
export declare function formatBatchSearchOutput(args: {
    items: BatchToolItemArgs[];
}, output: AnySearchBatchOutput, maxRenderedContentChars: number): string;
/** Execute validated items concurrently while preserving independent failures and input order. */
export declare function executeBatchSearch(client: AnySearchClient, parsed: AnySearchBatchItem[], signal: AbortSignal, maxRenderedContentChars: number): Promise<AnySearchBatchOutput>;
/** Register bounded client-side batch search on the Harness tool registry. */
export declare function registerBatchSearchTool(ctx: Context, client: AnySearchClient, maxRenderedContentChars: number): void;
export {};
