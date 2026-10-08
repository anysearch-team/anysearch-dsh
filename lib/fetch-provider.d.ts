/** AnySearch implementation of the DeepSeek Harness web fetch provider. */
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from '@deepseek-ai/dsh-web';
import { AnySearchClient } from './client.ts';
import type { AnySearchExtractResponse } from './types.ts';
/** Stable fetch-provider id selected through `ctx.web`. */
export declare const ANYSEARCH_FETCH_PROVIDER_ID = "anysearch";
/** Map cleaned Extract output into the provider-neutral fetch result. */
export declare function mapAnySearchExtractResponse(response: AnySearchExtractResponse): WebFetchResult;
/** Fetch provider backed by the AnySearch Extract HTTP API. */
export declare class AnySearchFetchProvider implements WebFetchProvider {
    private readonly client;
    readonly id = "anysearch";
    constructor(client: AnySearchClient);
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
}
