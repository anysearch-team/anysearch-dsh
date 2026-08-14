<div align="center">
  <a href="https://anysearch.com"><img src="docs/assets/anysearch-logo.svg" alt="AnySearch logo" width="96" height="96"></a>
  <h1>AnySearch for DeepSeek Harness</h1>
  <p>Native web search and advanced AnySearch tools for DeepSeek Harness.</p>
  <p><a href="https://github.com/anysearch-team/anysearch-dsh/actions/workflows/ci.yml"><img src="https://github.com/anysearch-team/anysearch-dsh/workflows/CI/badge.svg" alt="CI status"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a> <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%20%7C%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.19 or 24 and newer"></a> <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-plugin-4F46E5" alt="DeepSeek Harness plugin"></a></p>
  <p><strong>English</strong> | <a href="README.zh-CN.md">简体中文</a></p>
</div>

`anysearch-dsh` connects [AnySearch](https://anysearch.com) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It powers the native `web_search` tool and adds capability discovery, vertical search, and bounded batch search.

## Install

Requires Node.js 22.19 or Node.js 24+, plus pnpm 11.7.

```sh
git clone https://github.com/anysearch-team/anysearch-dsh.git
cd anysearch-dsh
pnpm install
pnpm run check
dsh plugin --profile web add .
```

DeepSeek Harness is in developer preview. This plugin follows its current `ctx.web` provider interface and may require updates after breaking Harness changes.

Set an API key before starting the profile:

Add it to the DSH-managed credential document at `$DSH_HOME/.credentials.yaml`
(`~/.dsh/.credentials.yaml` by default):

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

The plugin resolves this reference for every operation, so a managed credential
rotation reaches the next operation without restarting DSH. A launching
environment variable remains the highest-priority source:

```sh
export ANYSEARCH_API_KEY=as_sk_your_key
dsh --profile web --dump-config
dsh --profile web
```

PowerShell:

```powershell
$env:ANYSEARCH_API_KEY = 'as_sk_your_key'
dsh --profile web --dump-config
dsh --profile web
```

The API key is optional. Without a configured value for the reference, requests
use AnySearch's anonymous quota. `--dump-config` shows only the
`ANYSEARCH_API_KEY` reference, never the credential value.

## Composition

The bundle contributes two composition changes:

1. it selects `anysearch` as the existing `ctx.web` search provider;
2. it mounts this package's `web-search-anysearch` plugin.

The plugin registers the Provider and three model-facing advanced tools. Ordinary queries still use `web_search`; vertical queries discover tags through `anysearch_capabilities` and execute through `anysearch_search` or `anysearch_batch_search`.

## Configuration

The bundled `cordis.patch.yml` reads `ANYSEARCH_API_KEY`. A profile can replace the provider row with its own complete configuration:

```yaml
- id: web-search-anysearch
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
    baseURL: https://api.anysearch.com
    maxRenderedContentChars: 12000
```

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `ANYSEARCH_API_KEY` | Credential reference resolved for every operation; missing uses anonymous access |
| `baseURL` | `https://api.anysearch.com` | API base URL; the client appends public `/v1/*` paths |
| `maxRenderedContentChars` | `12000` | Aggregate cleaned-content characters rendered by one advanced tool call |

## Provider behavior

- Sends the harness request's `query` and optional `maxResults` as `query` and `max_results`.
- Maps AnySearch `title`, `url`, and `snippet` into the provider-neutral result.
- Does not put AnySearch's full cleaned `content` field into the model result.
- Propagates caller cancellation as `WEB_ABORTED`.
- Reports transport, HTTP, and response-validation failures as `WEB_PROVIDER_ERROR`.
- Rejects HTTP redirects before a credential or query can be forwarded to the redirect target.
- Sends `X-Anysearch-Client: dsh/0.1.0` for traffic attribution.

## Advanced tools

`anysearch_capabilities` lists the live domain catalog. Pass up to five selected domains to receive their exact tags and parameter definitions. Both catalog levels preserve the request ID in canonical and model-visible results.

`anysearch_search` accepts `query`, `maxResults`, `tag`, `params`, `zone`, `language`, and `includeContent`. Its canonical result preserves `requestId`, timing metadata, and full validated content. Native rendering includes cleaned content only when `includeContent` is true and caps it with `maxRenderedContentChars`.

`anysearch_batch_search` accepts one to five complete search items. It starts the independent HTTP requests concurrently, preserves input order, retains partial failures, cancels every in-flight request on caller cancellation, and shares one rendering budget across the batch.

All three tools use the same HTTP client, credential reference, cancellation signal, redirect policy, and response validation as the Provider.

## Chinese documentation

- [使用指南](docs/user-guide.zh-CN.md)
- [DSH 插件与 Skill、MCP、HTTP 接入方式对比](docs/integration-options.zh-CN.md)

## Development

```sh
pnpm run typecheck
pnpm run test
pnpm run build
```

The live API E2E is opt-in. It assembles the real DSH Provider and tools, then exercises the catalog, vertical search, batches, cancellation, credential behavior, UI intent, and plugin disposal. Anonymous mode avoids ambient credentials:

```sh
ANYSEARCH_E2E=1 ANYSEARCH_E2E_ANONYMOUS=1 pnpm run test:e2e
```

Omit `ANYSEARCH_E2E_ANONYMOUS` to test the `ANYSEARCH_API_KEY` supplied by the environment.

## Known limitations

- This plugin does not currently provide `anysearch_extract`.
- Configure the API key through DSH-managed credentials or an environment variable; the DSH settings page does not provide a third-party Provider credential field.

## License

[MIT](LICENSE)
