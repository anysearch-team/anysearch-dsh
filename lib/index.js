/** Register AnySearch as a native Provider and model-facing advanced tools. */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { applyWebFetchTool, DEFAULT_FETCH_MAX_OUTPUT_CHARS, DEFAULT_WEB_TOOL_TIMEOUT_MS, } from '@deepseek-ai/dsh-tool-web';
import z from '@deepseek-ai/schemastery';
import { ANYSEARCH_DEFAULT_BASE_URL, AnySearchClient, } from "./client.js";
import { AnySearchProvider } from "./provider.js";
import { AnySearchFetchProvider } from "./fetch-provider.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerBatchSearchTool } from "./tools/batch.js";
import { DEFAULT_MAX_RENDERED_CONTENT_CHARS, registerAdvancedSearchTool, } from "./tools/search.js";
export { ANYSEARCH_DEFAULT_BASE_URL, AnySearchClient, AnySearchClientError, } from "./client.js";
export { ANYSEARCH_DSH_CLIENT_ID, ANYSEARCH_DSH_VERSION, } from "./version.js";
export { ANYSEARCH_PROVIDER_ID, AnySearchProvider, mapAnySearchResponse, mapAnySearchResult, } from "./provider.js";
export { ANYSEARCH_FETCH_PROVIDER_ID, AnySearchFetchProvider, mapAnySearchExtractResponse, } from "./fetch-provider.js";
export { ANYSEARCH_BATCH_SEARCH_TOOL_NAME, executeBatchSearch, formatBatchSearchOutput, parseBatchSearchItems, registerBatchSearchTool, } from "./tools/batch.js";
export { ANYSEARCH_CAPABILITIES_TOOL_NAME, formatDomains, formatSubDomains, parseCapabilityDomains, registerCapabilitiesTool, } from "./tools/capabilities.js";
export { ANYSEARCH_SEARCH_TOOL_NAME, DEFAULT_MAX_RENDERED_CONTENT_CHARS, formatAdvancedSearchOutput, parseAdvancedSearchArgs, registerAdvancedSearchTool, } from "./tools/search.js";
/** Cordis plugin name used in loader diagnostics. */
export const name = 'web-search-anysearch';
/** Capability seams required by the Providers and model-facing tools. */
export const inject = ['web', 'credentials', 'systemPrompt', 'tools'];
const DEFAULT_API_KEY_ENV = 'ANYSEARCH_API_KEY';
// Let Schemastery infer its version-specific input/default modes. The runtime
// receives resolved values described by Config, not schema input expressions.
export const Config = z.object({
    apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
    baseURL: z.string(),
    maxRenderedContentChars: z.number().step(1).min(1).default(DEFAULT_MAX_RENDERED_CONTENT_CHARS),
});
/** Resolve defaults and reject self-contained configuration errors before registration. */
export function resolveConfig(config) {
    const apiKeyEnv = (config.apiKeyEnv ?? DEFAULT_API_KEY_ENV).trim();
    if (apiKeyEnv.length === 0)
        throw new Error('apiKeyEnv must be a non-empty credential reference');
    const baseURL = (config.baseURL ?? ANYSEARCH_DEFAULT_BASE_URL).trim();
    let parsedURL;
    try {
        parsedURL = new URL(baseURL);
    }
    catch {
        throw new Error('baseURL must be an absolute URL');
    }
    if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
        throw new Error('baseURL must use HTTP or HTTPS');
    }
    if (parsedURL.username.length > 0 || parsedURL.password.length > 0) {
        throw new Error('baseURL must not contain credentials');
    }
    const maxRenderedContentChars = config.maxRenderedContentChars ?? DEFAULT_MAX_RENDERED_CONTENT_CHARS;
    if (!Number.isSafeInteger(maxRenderedContentChars) || maxRenderedContentChars < 1) {
        throw new Error('maxRenderedContentChars must be a positive integer');
    }
    return { apiKeyEnv, baseURL, maxRenderedContentChars };
}
/** Register the AnySearch Provider and advanced tools with their owning services. */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    const apiKeyEnv = credentialRef(resolved.apiKeyEnv);
    const client = new AnySearchClient({
        resolveApiKey: async () => (await ctx.credentials.resolve(apiKeyEnv))?.value,
        apiKeyReference: resolved.apiKeyEnv,
        baseURL: resolved.baseURL,
    });
    ctx.web.registerSearchProvider(new AnySearchProvider(client));
    ctx.web.registerFetchProvider(new AnySearchFetchProvider(client));
    if (ctx.tools.get('web_fetch') === undefined) {
        applyWebFetchTool(ctx, DEFAULT_WEB_TOOL_TIMEOUT_MS, DEFAULT_FETCH_MAX_OUTPUT_CHARS);
    }
    registerCapabilitiesTool(ctx, client);
    registerBatchSearchTool(ctx, client, resolved.maxRenderedContentChars);
    registerAdvancedSearchTool(ctx, client, resolved.maxRenderedContentChars);
}
