<div align="center">
  <a href="https://anysearch.com"><img src="https://anysearch.com/favicon.ico" alt="AnySearch logo" width="96" height="96"></a>
  <h1>@anysearch/dsh</h1>
  <p>Official AnySearch web search plugin for DeepSeek Harness.</p>
  <p><a href="https://www.npmjs.com/package/@anysearch/dsh"><img src="https://img.shields.io/npm/v/%40anysearch%2Fdsh?logo=npm" alt="npm version"></a> <a href="https://www.npmjs.com/package/@anysearch/dsh"><img src="https://img.shields.io/npm/dm/%40anysearch%2Fdsh?logo=npm" alt="npm downloads"></a> <a href="https://github.com/anysearch-team/anysearch-dsh/actions/workflows/ci.yml"><img src="https://github.com/anysearch-team/anysearch-dsh/workflows/CI/badge.svg" alt="CI status"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a> <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DeepSeek-Harness-4F46E5" alt="DeepSeek Harness plugin"></a></p>
  <p><strong>English</strong> | <a href="README.zh-CN.md">简体中文</a></p>
</div>

`@anysearch/dsh` connects [AnySearch](https://anysearch.com) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It powers Harness's native `web_search` and adds capability discovery, vertical search, and bounded batch search.

## Quick start

Requires Node.js 22.19 or Node.js 24+, pnpm 11.7, and DeepSeek Harness. The DSH plugin command uses pnpm to manage profile dependencies, so `pnpm` must be available on `PATH`.

Install the plugin into the `web` profile:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/dsh
```

Start DeepSeek Harness:

```sh
npx -y @deepseek-ai/dsh web
```

No API key is required for a quick start. Requests use AnySearch's anonymous quota until you configure one.

## What you get

- Native AnySearch results through Harness's built-in `web_search`.
- Live capability and vertical-search discovery.
- Advanced search with tags, parameters, region, and language.
- Concurrent batches of one to five searches with partial-failure handling.
- Optional cleaned page content with a bounded rendering budget.
- Caller cancellation, response validation, and redirect-safe credential handling.

## Optional API key

The plugin works without an API key using AnySearch's anonymous quota. For account-level quota, add the credential to `$DSH_HOME/.credentials.yaml` (`~/.dsh/.credentials.yaml` by default):

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

The plugin resolves the managed credential for every operation, so credential rotation reaches the next request without restarting DSH. A launching `ANYSEARCH_API_KEY` environment variable has higher priority.

Inspect the composed profile without exposing the credential value:

```sh
npx -y @deepseek-ai/dsh --profile web --dump-config
```

## Tools

| Use case | Harness tool |
|---|---|
| Ordinary web search | `web_search` |
| Discover available domains and tags | `anysearch_capabilities` |
| Vertical or parameterized search | `anysearch_search` |
| Run one to five searches together | `anysearch_batch_search` |

For ordinary prompts, let Harness select the tool. Models can discover live domain and parameter definitions before making a specialized search.

## Configuration

The bundled profile layer selects AnySearch as the existing `ctx.web` provider and mounts the advanced tools. A profile can replace the provider row with its own complete configuration:

```yaml
- id: web-search-anysearch
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
    baseURL: https://api.anysearch.com
    maxRenderedContentChars: 12000
```

| Field | Default | Purpose |
|---|---|---|
| `apiKeyEnv` | `ANYSEARCH_API_KEY` | DSH credential reference; missing uses anonymous access |
| `baseURL` | `https://api.anysearch.com` | AnySearch API base URL |
| `maxRenderedContentChars` | `12000` | Maximum cleaned-content characters rendered to the model per advanced tool call |

## Manage the plugin

Update:

```sh
npx -y @deepseek-ai/dsh plugin --profile web update @anysearch/dsh
```

Remove:

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove @anysearch/dsh
```

## Compatibility and limitations

- DeepSeek Harness is in developer preview and may make compatibility-breaking changes.
- This plugin currently does not provide `anysearch_extract`.
- Configure the API key through DSH-managed credentials or an environment variable; the DSH settings page does not currently provide a third-party Provider credential field.

## Documentation

- [Chinese user guide](docs/user-guide.zh-CN.md)
- [DSH plugin, Skill, MCP, and HTTP integration comparison](docs/integration-options.zh-CN.md)

## Development

```sh
git clone https://github.com/anysearch-team/anysearch-dsh.git
cd anysearch-dsh
pnpm install
pnpm run check
```

The live AnySearch E2E suite is opt-in. Run it without ambient credentials in anonymous mode:

```sh
ANYSEARCH_E2E=1 ANYSEARCH_E2E_ANONYMOUS=1 pnpm run test:e2e
```

## License

[MIT](LICENSE)
