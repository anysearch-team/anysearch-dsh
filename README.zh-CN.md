<div align="center">
  <a href="https://anysearch.com"><img src="docs/assets/anysearch-logo.svg" alt="AnySearch Logo" width="96" height="96"></a>
  <h1>@anysearch/anysearch-dsh</h1>
  <p>AnySearch 面向 DeepSeek Harness 的官方网页搜索插件。</p>
  <p><a href="https://www.npmjs.com/package/@anysearch/anysearch-dsh"><img src="https://img.shields.io/npm/v/%40anysearch%2Fanysearch-dsh?logo=npm" alt="npm 版本"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 许可证"></a> <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DeepSeek-Harness-4F46E5" alt="DeepSeek Harness 插件"></a></p>
  <p><a href="README.md">English</a> | <strong>简体中文</strong></p>
</div>

`@anysearch/anysearch-dsh` 将 [AnySearch](https://anysearch.com) 接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。它既能驱动 Harness 原生的 `web_search`，也提供能力发现、垂直搜索和有界批量搜索。

## 快速开始

需要 Node.js 22.19 或 Node.js 24+、pnpm 11.7 和 DeepSeek Harness。DSH 插件命令使用 pnpm 管理 profile 依赖，因此 `pnpm` 必须位于 `PATH` 中。

将插件安装到 `web` profile：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
```

启动 DeepSeek Harness：

```sh
npx -y @deepseek-ai/dsh web
```

快速体验不需要 API Key。未配置时，请求使用 AnySearch 匿名额度。

## 提供什么

- 通过 Harness 内置的 `web_search` 返回 AnySearch 搜索结果。
- 实时发现可用领域和垂直搜索能力。
- 使用标签、参数、地区和语言执行高级搜索。
- 并发执行一至五个搜索，并保留单项失败。
- 按需提供清洗后的网页正文，并限制向模型展示的字符数。
- 支持调用方取消、响应校验和不会向重定向目标泄露凭据的安全策略。

## 可选 API Key

插件可以使用 AnySearch 匿名额度，无需 API Key。需要账号级额度时，将凭据写入 `$DSH_HOME/.credentials.yaml`，默认位置是 `~/.dsh/.credentials.yaml`：

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

插件会在每次操作时解析受管凭据，因此轮换凭据后，下一次请求即可使用新值，无需重启 DSH。启动进程的 `ANYSEARCH_API_KEY` 环境变量具有更高优先级。

可以检查最终组合配置，输出中不会出现真实凭据值：

```sh
npx -y @deepseek-ai/dsh --profile web --dump-config
```

## 工具

| 使用场景 | Harness 工具 |
|---|---|
| 普通网页搜索 | `web_search` |
| 查看可用领域和标签 | `anysearch_capabilities` |
| 垂直或参数化搜索 | `anysearch_search` |
| 一次执行一至五个搜索 | `anysearch_batch_search` |

对于普通提示词，让 Harness 自动选择工具即可。模型可以先读取实时领域和参数定义，再执行专门搜索。

## 配置

随包提供的 profile 层会将 AnySearch 设为现有 `ctx.web` Provider，并挂载高级工具。profile 可以使用完整配置替换 Provider 行：

```yaml
- id: web-search-anysearch
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
    baseURL: https://api.anysearch.com
    maxRenderedContentChars: 12000
```

| 字段 | 默认值 | 用途 |
|---|---|---|
| `apiKeyEnv` | `ANYSEARCH_API_KEY` | DSH 凭据引用；缺失时使用匿名访问 |
| `baseURL` | `https://api.anysearch.com` | AnySearch API 基础地址 |
| `maxRenderedContentChars` | `12000` | 单次高级工具调用向模型展示的清洗正文字符上限 |

## 管理插件

更新：

```sh
npx -y @deepseek-ai/dsh plugin --profile web update @anysearch/anysearch-dsh
```

移除：

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove @anysearch/anysearch-dsh
```

## 兼容性与限制

- DeepSeek Harness 仍处于开发预览阶段，可能发布不兼容变更。
- 本插件当前不提供 `anysearch_extract`。
- 请通过 DSH 管理的凭据文件或环境变量配置 API Key；DSH 设置页当前不提供第三方 Provider 凭据输入项。

## 文档

- [详细使用指南](docs/user-guide.zh-CN.md)
- [DSH 插件与 Skill、MCP、HTTP 接入方式对比](docs/integration-options.zh-CN.md)

## 开发

```sh
git clone https://github.com/anysearch-team/anysearch-dsh.git
cd anysearch-dsh
pnpm install
pnpm run check
```

真实 AnySearch E2E 测试需要显式开启。匿名模式不会读取环境中的凭据：

```sh
ANYSEARCH_E2E=1 ANYSEARCH_E2E_ANONYMOUS=1 pnpm run test:e2e
```

## 许可证

[MIT](LICENSE)
