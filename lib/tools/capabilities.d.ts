/** Model-facing discovery tool for AnySearch's dynamic capability catalog. */
import type { Context } from '@deepseek-ai/cordis';
import type { AnySearchClient } from '../client.ts';
import type { AnySearchDomainsResponse, AnySearchSubDomainsResponse } from '../types.ts';
/** Stable model-facing name for dynamic AnySearch capability discovery. */
export declare const ANYSEARCH_CAPABILITIES_TOOL_NAME = "anysearch_capabilities";
/** Validate, trim, and deduplicate a model-supplied domain list. */
export declare function parseCapabilityDomains(domains: string[]): string[];
/** Render the top-level domain catalog for the model. */
export declare function formatDomains(result: AnySearchDomainsResponse): string;
/** Render detailed dynamic parameters without guessing undeclared fields. */
export declare function formatSubDomains(result: AnySearchSubDomainsResponse): string;
/** Register dynamic capability discovery on the Harness tool registry. */
export declare function registerCapabilitiesTool(ctx: Context, client: AnySearchClient): void;
