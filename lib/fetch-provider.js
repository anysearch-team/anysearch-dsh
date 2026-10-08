/** AnySearch implementation of the DeepSeek Harness web fetch provider. */
import { WebError } from '@deepseek-ai/dsh-web';
import { AnySearchClient, AnySearchClientError } from "./client.js";
import { ANYSEARCH_PROVIDER_ID } from "./provider.js";
/** Stable fetch-provider id selected through `ctx.web`. */
export const ANYSEARCH_FETCH_PROVIDER_ID = ANYSEARCH_PROVIDER_ID;
/** Map cleaned Extract output into the provider-neutral fetch result. */
export function mapAnySearchExtractResponse(response) {
    return {
        url: response.url,
        // The public Extract success projection omits internal source status and truncation metadata.
        // A successful response is normalized to the fields required by the DSH fetch seam; this
        // adapter does not truncate the returned cleaned content further.
        statusCode: 200,
        body: { kind: 'text', content: response.content },
        truncated: false,
    };
}
/** Fetch provider backed by the AnySearch Extract HTTP API. */
export class AnySearchFetchProvider {
    client;
    id = ANYSEARCH_FETCH_PROVIDER_ID;
    constructor(client) {
        this.client = client;
    }
    available() {
        return this.client.available();
    }
    async fetch(request, signal) {
        try {
            return mapAnySearchExtractResponse(await this.client.extract({ url: request.url }, signal));
        }
        catch (error) {
            if (error instanceof AnySearchClientError) {
                throw new WebError(error.message, webErrorCode(error), { cause: error });
            }
            throw new WebError(error instanceof Error ? error.message : `AnySearch extract failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
        }
    }
}
function webErrorCode(error) {
    if (error.kind === 'aborted' || error.errorCode === 'extract_canceled')
        return 'WEB_ABORTED';
    switch (error.errorCode) {
        case 'invalid_extract_url': return 'WEB_INVALID_URL';
        case 'extract_target_blocked': return 'WEB_BLOCKED_URL';
        case 'extract_content_too_large': return 'WEB_FETCH_TOO_LARGE';
        case 'extract_unsupported_content': return 'WEB_UNSUPPORTED_CONTENT_TYPE';
        case 'extract_timeout': return 'WEB_FETCH_TIMEOUT';
        default: return 'WEB_PROVIDER_ERROR';
    }
}
