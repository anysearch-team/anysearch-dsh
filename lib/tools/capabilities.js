/** Model-facing discovery tool for AnySearch's dynamic capability catalog. */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ANYSEARCH_TOOL_TIMEOUT_MS } from "../limits.js";
/** Stable model-facing name for dynamic AnySearch capability discovery. */
export const ANYSEARCH_CAPABILITIES_TOOL_NAME = 'anysearch_capabilities';
const MAX_CAPABILITY_DOMAINS = 5;
const domainSummarySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        domain: { type: 'string', required: true },
        description: { type: 'string', required: true },
        subDomainCount: { type: 'integer', required: true },
    },
};
const subDomainSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        subDomain: { type: 'string', required: true },
        description: { type: 'string', required: true },
        params: { type: 'object', required: true, additionalProperties: true },
    },
};
const domainCapabilitySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        domain: { type: 'string', required: true },
        description: { type: 'string', required: true },
        subDomains: { type: 'array', required: true, items: subDomainSchema },
    },
};
const capabilitiesOutputSchema = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                kind: { type: 'string', const: 'domains', required: true },
                requestId: { type: 'string' },
                domains: { type: 'array', required: true, items: domainSummarySchema },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                kind: { type: 'string', const: 'sub_domains', required: true },
                requestId: { type: 'string' },
                domains: { type: 'array', required: true, items: domainCapabilitySchema },
            },
        },
    ],
};
/** Validate, trim, and deduplicate a model-supplied domain list. */
export function parseCapabilityDomains(domains) {
    if (domains.length === 0)
        throw new Error('domains must contain at least one domain');
    if (domains.length > MAX_CAPABILITY_DOMAINS) {
        throw new Error(`domains must contain at most ${MAX_CAPABILITY_DOMAINS} domains`);
    }
    const seen = new Set();
    const parsed = [];
    for (const raw of domains) {
        const domain = raw.trim();
        if (domain.length === 0)
            throw new Error('domains must not contain blank values');
        if (seen.has(domain))
            continue;
        seen.add(domain);
        parsed.push(domain);
    }
    return parsed;
}
/** Render the top-level domain catalog for the model. */
export function formatDomains(result) {
    const lines = [result.domains.length === 0
            ? 'No AnySearch domains are currently available.'
            : 'Available AnySearch domains:'];
    if (result.requestId !== undefined)
        lines.push(`Request ID: ${result.requestId}`);
    lines.push(...result.domains.map(domain => (`- ${domain.domain} (${domain.subDomainCount} sub-domains): ${domain.description}`)));
    return lines.join('\n');
}
/** Render detailed dynamic parameters without guessing undeclared fields. */
export function formatSubDomains(result) {
    const lines = [result.domains.length === 0
            ? 'No matching AnySearch domains were found.'
            : 'AnySearch vertical capabilities:'];
    if (result.requestId !== undefined)
        lines.push(`Request ID: ${result.requestId}`);
    for (const domain of result.domains) {
        lines.push(`- ${domain.domain}: ${domain.description}`);
        for (const subDomain of domain.subDomains) {
            lines.push(`  - ${subDomain.subDomain}: ${subDomain.description}`);
            const params = Object.entries(subDomain.params)
                .sort((left, right) => (left[1].sortOrder ?? Number.MAX_SAFE_INTEGER)
                - (right[1].sortOrder ?? Number.MAX_SAFE_INTEGER));
            for (const [name, info] of params) {
                lines.push(`    - ${name}${info.required ? ' (required)' : ''}: ${info.description}`);
            }
        }
    }
    if (result.domains.length > 0) {
        lines.push('Use the exact sub-domain as anysearch_search.tag and pass only declared params.');
    }
    return lines.join('\n');
}
/** Register dynamic capability discovery on the Harness tool registry. */
export function registerCapabilitiesTool(ctx, client) {
    ctx.tools.register(defineTool({
        name: ANYSEARCH_CAPABILITIES_TOOL_NAME,
        timeoutMs: ANYSEARCH_TOOL_TIMEOUT_MS,
        description: 'Discover current AnySearch domains, vertical tags, and parameter definitions. Call without domains for the top-level catalog, then with up to five selected domains before using a vertical tag.',
        parameters: {
            domains: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to five top-level domain names. Omit to list all top-level domains.',
            },
        },
        output: {
            schema: capabilitiesOutputSchema,
            render: (_args, value) => [{
                    type: 'text',
                    text: value.kind === 'domains'
                        ? formatDomains(value)
                        : formatSubDomains(value),
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            if (args.domains === undefined) {
                const result = await client.listDomains(exec.signal);
                return {
                    kind: 'domains',
                    ...result.requestId === undefined ? {} : { requestId: result.requestId },
                    domains: result.domains,
                };
            }
            const result = await client.getSubDomains(parseCapabilityDomains(args.domains), exec.signal);
            return {
                kind: 'sub_domains',
                ...result.requestId === undefined ? {} : { requestId: result.requestId },
                domains: result.domains.map(domain => ({
                    domain: domain.domain,
                    description: domain.description,
                    subDomains: domain.subDomains.map(subDomain => ({
                        subDomain: subDomain.subDomain,
                        description: subDomain.description,
                        params: Object.fromEntries(Object.entries(subDomain.params).map(([param, info]) => [
                            param,
                            {
                                description: info.description,
                                required: info.required,
                                ...info.sortOrder === undefined ? {} : { sortOrder: info.sortOrder },
                            },
                        ])),
                    })),
                })),
            };
        },
        presentCall: (args) => ({
            card: 'generic',
            title: args.domains === undefined ? 'AnySearch domains' : `AnySearch: ${args.domains.join(', ')}`,
            kind: 'search',
            rawInput: args.domains?.join(', ') ?? 'all domains',
        }),
    }));
}
