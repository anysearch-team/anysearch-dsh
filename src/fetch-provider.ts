/** AnySearch implementation of the DeepSeek Harness web fetch provider. */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
} from '@deepseek-ai/dsh-web'
import { AnySearchClient, AnySearchClientError } from './client.ts'
import { ANYSEARCH_PROVIDER_ID } from './provider.ts'
import type { AnySearchExtractResponse } from './types.ts'

/** Stable fetch-provider id selected through `ctx.web`. */
export const ANYSEARCH_FETCH_PROVIDER_ID = ANYSEARCH_PROVIDER_ID

/** Map cleaned Extract output into the provider-neutral fetch result. */
export function mapAnySearchExtractResponse(response: AnySearchExtractResponse): WebFetchResult {
  return {
    url: response.effectiveUrl,
    statusCode: response.sourceHttpStatus,
    body: { kind: 'text', content: response.content },
    truncated: response.truncated,
  }
}

/** Fetch provider backed by the AnySearch Extract HTTP API. */
export class AnySearchFetchProvider implements WebFetchProvider {
  readonly id = ANYSEARCH_FETCH_PROVIDER_ID

  constructor(private readonly client: AnySearchClient) {}

  available(): boolean {
    return this.client.available()
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    try {
      return mapAnySearchExtractResponse(await this.client.extract({ url: request.url }, signal))
    } catch (error: unknown) {
      if (error instanceof AnySearchClientError) {
        throw new WebError(error.message, webErrorCode(error), { cause: error })
      }
      throw new WebError(
        error instanceof Error ? error.message : `AnySearch extract failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
  }
}

function webErrorCode(error: AnySearchClientError): string {
  if (error.kind === 'aborted' || error.errorCode === 'extract_canceled') return 'WEB_ABORTED'
  switch (error.errorCode) {
    case 'invalid_extract_url': return 'WEB_INVALID_URL'
    case 'extract_target_blocked': return 'WEB_BLOCKED_URL'
    case 'extract_content_too_large': return 'WEB_FETCH_TOO_LARGE'
    case 'extract_unsupported_content': return 'WEB_UNSUPPORTED_CONTENT_TYPE'
    case 'extract_timeout': return 'WEB_FETCH_TIMEOUT'
    default: return 'WEB_PROVIDER_ERROR'
  }
}
