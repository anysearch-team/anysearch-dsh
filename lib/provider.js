/** AnySearch implementation of the DeepSeek Harness web search provider. */
import { WebError } from '@deepseek-ai/dsh-web';
import { AnySearchClient, AnySearchClientError } from "./client.js";
/** Stable provider id selected through `ctx.web`. */
export const ANYSEARCH_PROVIDER_ID = 'anysearch';
/** Map a validated AnySearch result into the provider-neutral web source. */
export function mapAnySearchResult(result) {
    if (result.url === undefined)
        throw new TypeError('AnySearch web source must have a URL');
    const title = result.title.trim();
    const snippet = result.snippet?.trim();
    return {
        url: result.url,
        ...title.length > 0 ? { title } : {},
        ...snippet !== undefined && snippet.length > 0 ? { snippet } : {},
    };
}
/** Map a validated AnySearch response into the provider-neutral result. */
export function mapAnySearchResponse(response) {
    return {
        sources: response.results.filter(hasSourceURL).map(mapAnySearchResult),
        truncated: false,
    };
}
function hasSourceURL(result) {
    return result.url !== undefined;
}
/** Search provider backed by the shared AnySearch HTTP client. */
export class AnySearchProvider {
    client;
    id = ANYSEARCH_PROVIDER_ID;
    constructor(client) {
        this.client = client;
    }
    available() {
        return this.client.available();
    }
    async search(request, signal) {
        try {
            return mapAnySearchResponse(await this.client.search({
                query: request.query,
                ...request.maxResults === undefined ? {} : { maxResults: request.maxResults },
            }, signal));
        }
        catch (error) {
            if (error instanceof AnySearchClientError && error.kind === 'aborted') {
                throw new WebError('AnySearch search aborted', 'WEB_ABORTED', { cause: error });
            }
            throw new WebError(error instanceof Error ? error.message : `AnySearch search failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
        }
    }
}
