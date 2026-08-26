<div align="center">
  <a href="https://anysearch.com"><img src="docs/assets/anysearch-logo.svg" alt="AnySearch logo" width="96" height="96"></a>
  <h1>@anysearch/anysearch-dsh</h1>
  <p>AnySearch-powered real-time web and vertical search for DeepSeek Harness.</p>
  <p><a href="https://anysearch.com"><img src="https://img.shields.io/badge/AnySearch-AI_Search-485DC9.svg?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzQ4NzZfNzgwKSI+CjxwYXRoIGQ9Ik02IDguNUgzLjVWMy41SDguNVY2SDExVjFIMVYxMUg2VjguNVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMSA4LjVIOC41VjExSDExVjguNVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik02IDguNUgzLjVWMTFINlY4LjVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMy41IDFIMVYzLjVIMy41VjFaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNOC41IDFIMy41VjMuNUg4LjVWMVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMSAxSDguNVYzLjVIMTFWMVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMSAzLjVIOC41VjZIMTFWMy41WiIgZmlsbD0id2hpdGUiLz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF80ODc2Xzc4MCI+CjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0id2hpdGUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEgMSkiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4K" alt="AnySearch AI Search"></a> <a href="https://www.npmjs.com/package/@anysearch/anysearch-dsh"><img src="https://img.shields.io/npm/v/%40anysearch%2Fanysearch-dsh?logo=npm" alt="npm version"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a> <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DeepSeek-Harness-4F46E5" alt="DeepSeek Harness plugin"></a></p>
  <p><strong>English</strong> | <a href="README.zh-CN.md">简体中文</a></p>
</div>

`@anysearch/anysearch-dsh` connects [AnySearch](https://anysearch.com) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) as a plugin. Keep using Harness's native `web_search` and `web_fetch` while gaining real-time web search, cleaned URL content, vertical search, and concurrent batch search.

AnySearch is search infrastructure for AI agents, covering the public web and specialized data sources across code, finance, academia, law, security, and more.

## Quick start

### For AI Agents

```sh
# Fetch the complete installation guide, read it end to end, and then follow it step by step:
curl -fsSL https://raw.githubusercontent.com/anysearch-team/anysearch-dsh/refs/heads/main/docs/agent-installation.md
```

### For Humans

Install the plugin into the `web` profile:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
```

Start DeepSeek Harness:

```sh
npx -y @deepseek-ai/dsh web
```

No API key is required for a quick start. Requests use AnySearch's anonymous quota until you configure one.

## What you get

- Through Harness's built-in `web_search`, AnySearch returns results with titles, snippets, and URLs for easy citation.
- Through Harness's built-in `web_fetch`, AnySearch Extract retrieves and cleans the content of a specific public HTTP(S) URL.
- Discover searchable domains, vertical categories, and supported parameters in real time, then run advanced searches using tags, regions, languages, and structured parameters.
- Run one to five searches concurrently; an individual failure does not affect the other results.
- Advanced search can return cleaned page content on demand for deeper research.

## Optional API key

Try it without an API key.

Sign up for an AnySearch account and configure an API key to get 1,000 free search calls per day.

Sign up or sign in at [anysearch.com](https://anysearch.com), then visit [API Keys](https://www.anysearch.com/console/api-keys) to get one. Store the key in `$DSH_HOME/.credentials.yaml` (`~/.dsh/.credentials.yaml` by default):

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
| Fetch and clean a specific URL | `web_fetch` |
| Discover available domains and tags | `anysearch_capabilities` |
| Vertical or parameterized search | `anysearch_search` |
| Run one to five searches together | `anysearch_batch_search` |

For ordinary prompts, let Harness select the tool. Models can discover live domain and parameter definitions before making a specialized search.

## Environment requirements

Requires Node.js 22.19 or Node.js 24+, pnpm 11.7, and DeepSeek Harness. The DSH plugin command uses pnpm to manage profile dependencies, so `pnpm` must be available on `PATH`.

Windows, Linux, and macOS use the same installation command. Before installing, ensure that Node.js, `npx`, and `pnpm` can all be run directly from `PATH`.

## Configuration

The bundled profile layer automatically selects AnySearch as the existing `ctx.web` search and fetch provider, enables `web_fetch`, and mounts the advanced tools, so no changes are required by default.

To customize it, ask an AI assistant—or edit it manually—to add the complete block below to the target DSH profile's user configuration layer, overriding the bundled `id: web-search-anysearch` entry. Keep the `id` unchanged, replace the complete `config`, and do not add a second AnySearch provider under a different ID:

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
npx -y @deepseek-ai/dsh plugin --profile web update @anysearch/anysearch-dsh
```

Remove:

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove @anysearch/anysearch-dsh
```

## Compatibility and limitations

- DeepSeek Harness is in developer preview and may make compatibility-breaking changes.
- URL extraction is exposed through Harness's provider-neutral `web_fetch`; the plugin does not add a duplicate `anysearch_extract` tool.
- Configure the API key through DSH-managed credentials or an environment variable; the DSH settings page does not currently provide a third-party Provider credential field.

## Documentation

- [Chinese user guide](docs/user-guide.zh-CN.md)
- [DSH plugin, Skill, MCP, and HTTP integration comparison](docs/integration-options.zh-CN.md)

## Community & Support

Join the AnySearch community to share your experience, report issues, and get technical support.

- [GitHub Issues](https://github.com/anysearch-team/anysearch-dsh/issues): submit bug reports and usage feedback.
- WeChat Group: scan the QR code below and complete the group survey; staff will invite you after review.
- [Discord Community](https://discord.gg/3WAmxyuBSc): scan the QR code or follow the link to join directly.

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>WeChat group survey</strong><br><img src="docs/assets/discord-community-qr.png" alt="WeChat group survey QR code" width="180"></td>
      <td align="center"><strong>Discord invite</strong><br><img src="docs/assets/wechat-community-qr.jpg" alt="Discord invite QR code" width="180"></td>
    </tr>
  </table>
</div>

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
