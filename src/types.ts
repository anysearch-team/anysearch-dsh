/** Scalar value accepted by AnySearch vertical-search parameters. */
export type AnySearchParamValue = string | number | boolean

/** One result returned by the AnySearch public search API. */
export interface AnySearchResult {
  title: string
  url: string
  snippet?: string
  content?: string
}

/** Search request accepted by the shared AnySearch HTTP client. */
export interface AnySearchSearchRequest {
  query: string
  maxResults?: number
  tag?: string
  params?: Record<string, AnySearchParamValue>
  zone?: 'cn' | 'intl'
  language?: string
}

/** Search result metadata returned by AnySearch. */
export interface AnySearchMetadata {
  totalResults: number
  searchTimeMs: number
}

/** Validated AnySearch search response. */
export interface AnySearchSearchResponse {
  requestId?: string
  results: AnySearchResult[]
  metadata: AnySearchMetadata
}

/** One top-level search domain returned by the dynamic capability catalog. */
export interface AnySearchDomainSummary {
  domain: string
  description: string
  subDomainCount: number
}

/** Validated top-level capability response. */
export interface AnySearchDomainsResponse {
  requestId?: string
  domains: AnySearchDomainSummary[]
}

/** Definition of one dynamic parameter accepted by a sub-domain. */
export interface AnySearchParamInfo {
  description: string
  required: boolean
  sortOrder?: number
}

/** One vertical capability returned by the dynamic catalog. */
export interface AnySearchSubDomain {
  subDomain: string
  description: string
  params: Record<string, AnySearchParamInfo>
}

/** One domain and its vertical capabilities. */
export interface AnySearchDomainCapability {
  domain: string
  description: string
  subDomains: AnySearchSubDomain[]
}

/** Validated detailed capability response. */
export interface AnySearchSubDomainsResponse {
  requestId?: string
  domains: AnySearchDomainCapability[]
}
