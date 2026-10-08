/** Cooperative deadline advertised by every AnySearch-specific tool. */
export declare const ANYSEARCH_TOOL_TIMEOUT_MS = 60000;
/** HTTP deadline kept below the tool budget so failures can settle cleanly. */
export declare const ANYSEARCH_HTTP_TIMEOUT_MS = 55000;
/** Maximum cleaned page content retained in one canonical search response. */
export declare const MAX_CANONICAL_CONTENT_CHARS = 200000;
/** Maximum upstream-controlled error detail retained in one failure message. */
export declare const MAX_UPSTREAM_ERROR_CHARS = 2000;
