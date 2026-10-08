/** AnySearch implementation of the DeepSeek Harness web search provider. */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import { AnySearchClient } from './client.ts';
import type { AnySearchResult, AnySearchSearchResponse } from './types.ts';
/** Stable provider id selected through `ctx.web`. */
export declare const ANYSEARCH_PROVIDER_ID = "anysearch";
/** Map a validated AnySearch result into the provider-neutral web source. */
export declare function mapAnySearchResult(result: AnySearchResult): WebSearchSource;
/** Map a validated AnySearch response into the provider-neutral result. */
export declare function mapAnySearchResponse(response: AnySearchSearchResponse): WebSearchResult;
/** Search provider backed by the shared AnySearch HTTP client. */
export declare class AnySearchProvider implements WebSearchProvider {
    private readonly client;
    readonly id = "anysearch";
    constructor(client: AnySearchClient);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
