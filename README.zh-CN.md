<div align="center">
  <a href="https://anysearch.com"><img src="docs/assets/anysearch-logo.svg" alt="AnySearch Logo" width="96" height="96"></a>
  <h1>AnySearch for DeepSeek Harness</h1>
  <p>为 DeepSeek Harness 提供原生网页搜索和 AnySearch 高级工具。</p>
  <p><a href="https://github.com/anysearch-team/anysearch-dsh/actions/workflows/ci.yml"><img src="https://github.com/anysearch-team/anysearch-dsh/workflows/CI/badge.svg" alt="CI 状态"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 许可证"></a> <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%20%7C%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.19 或 24 及以上版本"></a> <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-plugin-4F46E5" alt="DeepSeek Harness 插件"></a></p>
  <p><a href="README.md">English</a> | <strong>简体中文</strong></p>
</div>

`anysearch-dsh` 将 [AnySearch](https://anysearch.com) 接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。它既能驱动原生 `web_search` 工具，也提供能力发现、垂直搜索和有界批量搜索。

## 安装

需要 Node.js 22.19 或 Node.js 24+，以及 pnpm 11.7。

```sh
git clone https://github.com/anysearch-team/anysearch-dsh.git
cd anysearch-dsh
pnpm install
pnpm run check
dsh plugin --profile web add .
```

DeepSeek Harness 仍处于开发预览阶段。本插件使用其当前的 `ctx.web` Provider 接口，Harness 出现不兼容变更后可能需要同步升级。

启动 profile 前，请配置 API Key。

推荐将它写入 DSH 管理的凭据文件 `$DSH_HOME/.credentials.yaml`，默认位置是 `~/.dsh/.credentials.yaml`：

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

插件会在每次操作时重新解析该引用。修改受管凭据后，下一次操作即可使用新值，无需重启 DSH。启动进程的环境变量仍具有最高优先级：

```sh
export ANYSEARCH_API_KEY=as_sk_your_key
dsh --profile web --dump-config
dsh --profile web
```

PowerShell：

```powershell
$env:ANYSEARCH_API_KEY = 'as_sk_your_key'
dsh --profile web --dump-config
dsh --profile web
```

API Key 不是必填项。未配置该凭据引用时，请求使用 AnySearch 匿名额度。`--dump-config` 只显示 `ANYSEARCH_API_KEY` 引用，不会显示凭据值。

## 组合方式

该 bundle 会修改两处组合配置：

1. 将现有 `ctx.web` 搜索 Provider 设为 `anysearch`；
2. 挂载本包的 `web-search-anysearch` 插件。

插件注册一个 Provider 和三个模型可见的高级工具。普通查询仍使用 `web_search`；垂直查询先通过 `anysearch_capabilities` 获取标签，再使用 `anysearch_search` 或 `anysearch_batch_search` 执行。

## 配置

随包提供的 `cordis.patch.yml` 会读取 `ANYSEARCH_API_KEY`。profile 也可以用完整配置替换 Provider 行：

```yaml
- id: web-search-anysearch
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
    baseURL: https://api.anysearch.com
    maxRenderedContentChars: 12000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `ANYSEARCH_API_KEY` | 每次操作时解析的凭据引用；缺失时使用匿名访问 |
| `baseURL` | `https://api.anysearch.com` | API 基础地址；客户端会追加公开的 `/v1/*` 路径 |
| `maxRenderedContentChars` | `12000` | 单次高级工具调用可向模型展示的清洗正文字符总数 |

## Provider 行为

- 将 Harness 请求中的 `query` 和可选 `maxResults` 映射为 `query` 和 `max_results`。
- 将 AnySearch 的 `title`、`url` 和 `snippet` 映射为 Provider 通用结果。
- 不把 AnySearch 的完整清洗正文 `content` 放入模型结果。
- 将调用方取消操作报告为 `WEB_ABORTED`。
- 将网络、HTTP 和响应校验失败报告为 `WEB_PROVIDER_ERROR`。
- 在凭据或查询可能被转发到目标地址前拒绝 HTTP 重定向。
- 发送 `X-Anysearch-Client: dsh/0.1.0`，用于流量归因。

## 高级工具

`anysearch_capabilities` 返回实时领域目录。传入最多五个选定领域，可以获取对应的准确标签和参数定义。两级目录结果都会在规范结果和模型可见结果中保留请求 ID。

`anysearch_search` 接受 `query`、`maxResults`、`tag`、`params`、`zone`、`language` 和 `includeContent`。规范结果会保留 `requestId`、耗时元数据和完整的已校验内容。仅当 `includeContent` 为 `true` 时，原生渲染才会包含清洗正文，并受 `maxRenderedContentChars` 限制。

`anysearch_batch_search` 接受一至五个完整搜索项。它会并发启动相互独立的 HTTP 请求，保持输入顺序，保留单项失败，并在调用方取消时终止所有进行中的请求。整批请求共享同一个正文渲染额度。

三个工具与 Provider 共用 HTTP 客户端、凭据引用、取消信号、重定向策略和响应校验。

## 中文文档

- [详细使用指南](docs/user-guide.zh-CN.md)
- [DSH 插件与 Skill、MCP、HTTP 接入方式对比](docs/integration-options.zh-CN.md)

## 开发

```sh
pnpm run typecheck
pnpm run test
pnpm run build
```

真实 API E2E 测试需要显式开启。它会组装真实的 DSH Provider 和工具，并验证能力目录、垂直搜索、批量搜索、取消、凭据行为、UI 意图和插件卸载。匿名模式不会读取环境中的凭据：

```sh
ANYSEARCH_E2E=1 ANYSEARCH_E2E_ANONYMOUS=1 pnpm run test:e2e
```

删除 `ANYSEARCH_E2E_ANONYMOUS`，即可使用环境中的 `ANYSEARCH_API_KEY` 测试。

## 已知限制

- 本插件当前不提供 `anysearch_extract`。
- 请通过 DSH 管理的凭据文件或环境变量配置 API Key；DSH 设置页不提供第三方 Provider 凭据输入项。

## 许可证

[MIT](LICENSE)
