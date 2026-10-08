/** Cooperative deadline advertised by every AnySearch-specific tool. */
export const ANYSEARCH_TOOL_TIMEOUT_MS = 60_000;
/** HTTP deadline kept below the tool budget so failures can settle cleanly. */
export const ANYSEARCH_HTTP_TIMEOUT_MS = 55_000;
/** Maximum cleaned page content retained in one canonical search response. */
export const MAX_CANONICAL_CONTENT_CHARS = 200_000;
/** Maximum upstream-controlled error detail retained in one failure message. */
export const MAX_UPSTREAM_ERROR_CHARS = 2_000;
