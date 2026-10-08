/** Model-facing AnySearch search tool with dynamic vertical parameters. */
import type { Context } from '@deepseek-ai/cordis';
import type { AnySearchClient } from '../client.ts';
import type { JsonValue, AnySearchSearchRequest, AnySearchSearchResponse } from '../types.ts';
/** Stable model-facing name for full AnySearch search requests. */
export declare const ANYSEARCH_SEARCH_TOOL_NAME = "anysearch_search";
/** Initial model-visible content budget; deployment config may replace it. */
export declare const DEFAULT_MAX_RENDERED_CONTENT_CHARS = 12000;
interface ParsedSearchArgs {
    request: AnySearchSearchRequest;
    includeContent: boolean;
}
/** Validate value constraints that the current Tool schema DSL cannot express. */
export declare function parseAdvancedSearchArgs(args: {
    query: string;
    maxResults?: number;
    tag?: string;
    params?: Record<string, JsonValue>;
    zone?: 'cn' | 'intl';
    language?: string;
    includeContent?: boolean;
}): ParsedSearchArgs;
/** Format one bounded canonical result for the model. */
export declare function formatAdvancedSearchOutput(result: AnySearchSearchResponse & {
    renderedContentTruncated: boolean;
}, includeContent: boolean, maxRenderedContentChars: number): string;
/** Register full AnySearch search on the Harness tool registry. */
export declare function registerAdvancedSearchTool(ctx: Context, client: AnySearchClient, maxRenderedContentChars: number): void;
/** Retain cleaned page content on request and always retain URL-less structured data. */
export declare function canonicalSearchResults(results: AnySearchSearchResponse['results'], includeContent: boolean): AnySearchSearchResponse['results'];
export declare function renderableContentCharacters(results: AnySearchSearchResponse['results'], includeContent: boolean): number;
export {};
