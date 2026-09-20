# AnySearch for DeepSeek Harness 使用指南

[English](../README.md) | **简体中文**

适用范围：当前源码；DSH 版本矩阵和 npm 发布状态见[兼容性说明](dsh-compatibility.md)。

最后核对：2026-08-17

## 这是什么

`@anysearch/anysearch-dsh` 是 AnySearch 面向 DeepSeek Harness 的 Web 插件。安装后，DeepSeek Harness 内置的 `web_search` 会使用 AnySearch 完成实时网页搜索，`web_fetch` 会使用 AnySearch Extract 抓取并清洗指定 URL。

你不需要让模型学习新的普通搜索或抓取工具，也不需要单独配置 MCP Server。Agent 仍然调用 Harness 原生的 `web_search` 和 `web_fetch`，插件负责把请求发送到 AnySearch，并将结果转换为 Harness 的通用结果。

项目地址：<https://github.com/anysearch-team/anysearch-dsh>

## 当前版本支持什么

当前源码支持：

- 使用 AnySearch 执行通用网页搜索；
- 将查询词和结果数量发送到 `POST /v1/search`；
- 返回标题、URL 和摘要；
- 使用 Harness 原生 `web_search` 展示和引用搜索来源；
- 将目标 URL 发送到 `POST /v1/extract`；
- 使用 Harness 原生 `web_fetch` 返回最终 URL、源站 HTTP 状态和清洗后的正文；
- 将 AnySearch 已转换的 Markdown/文本作为 `text` 返回，避免 Harness 再次执行 HTML 转换；
- 通过 `anysearch_capabilities` 获取动态领域、标签和参数定义；
- 在两级能力目录结果中向模型保留请求 ID；
- 通过 `anysearch_search` 使用 `tag`、`params`、`zone` 和 `language`；
- 通过 `anysearch_batch_search` 并发执行一至五个完整搜索项；
- 按输入顺序返回批量结果，并保留单项失败；
- 在高级搜索结果中保留请求 ID、耗时和有界清洗正文；
- 按需向模型展示有字符上限的清洗正文；
- 通过 DeepSeek Harness 的凭据系统解析 `ANYSEARCH_API_KEY`；
- 在受管凭据文件中轮换 Key 后，下一次搜索自动使用新值；
- 未配置 API Key 时使用 AnySearch 匿名额度；
- 在 Agent 取消操作时中止正在进行的搜索或抓取；
- 为 HTTP 请求设置 55 秒 deadline，并为三个 AnySearch 高级工具声明 60 秒预算；
- 拒绝把查询或凭据转发到 HTTP 重定向目标。

## 环境要求

- Node.js `22.19` 或更高版本，或者 Node.js `24+`；
- pnpm `11.7`；
- 可以通过 `npx` 运行 DeepSeek Harness；
- 可访问 `https://api.anysearch.com`。

DeepSeek Harness 当前仍处于开发预览阶段。Harness 发布不兼容变更后，插件可能需要同步升级。

## 安装

将 npm 包安装到 DeepSeek Harness 的 `web` profile：

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
```

这一步会向 `web` profile 添加插件，把 AnySearch 选为该 profile 的搜索和抓取 Provider，并启用原生 `web_fetch`。

然后启动 DeepSeek Harness：

```bash
npx -y @deepseek-ai/dsh web
```

## 配置 API Key

API Key 是可选的。建议在持续使用或需要账号级额度时配置；快速体验可以先使用匿名额度。

推荐把 Key 写入 DSH 管理的凭据文件。默认位置为 `~/.dsh/.credentials.yaml`；如果设置了 `DSH_HOME`，位置为 `$DSH_HOME/.credentials.yaml`：

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

`as_sk_your_key` 是占位符，必须替换为有效 Key。原样保存时，插件会在发送 HTTP 请求前拒绝它；如需匿名访问，请删除整条配置。

Windows 默认对应：

```text
C:\Users\<用户名>\.dsh\.credentials.yaml
```

插件配置只保存引用名 `ANYSEARCH_API_KEY`，不会保存真实 Key。每次操作会重新解析一次引用，因此修改受管凭据文件后，下一次调用即可使用新 Key。

也可以通过启动环境变量提供 Key。环境变量优先级高于受管凭据文件，修改后需要重启当前 DSH 进程。

Linux 或 macOS：

```bash
export ANYSEARCH_API_KEY="as_sk_your_key"
npx -y @deepseek-ai/dsh --profile web --dump-config
npx -y @deepseek-ai/dsh --profile web
```

Windows PowerShell：

```powershell
$env:ANYSEARCH_API_KEY = 'as_sk_your_key'
npx -y @deepseek-ai/dsh --profile web --dump-config
npx -y @deepseek-ai/dsh --profile web
```

DSH 的标准本地凭据 Provider 按以下顺序解析同名引用：启动环境、`$DSH_HOME/.credentials.yaml`、当前调用目录的 `.env`、`$DSH_HOME/.env`。`--dump-config` 用来确认插件和 Provider 已进入最终配置，其中只应出现 `apiKeyEnv: ANYSEARCH_API_KEY`，不应出现真实 Key。请不要把真实 API Key 写入 Git 仓库、截图、日志或问题报告。

如果不设置 `ANYSEARCH_API_KEY`，直接启动即可：

```bash
npx -y @deepseek-ai/dsh --profile web
```

匿名请求受共享免费额度和更低限流约束。

当前 DSH Web 设置页不会自动为第三方 Provider 生成 AnySearch Key 输入框，因此请使用受管凭据文件或环境变量。插件需要 profile 提供标准 `credentials` 服务；官方 base profile 已包含该服务。

## 开始使用

安装完成后，像平时一样向 DeepSeek Harness 提问。普通联网查询继续调用 `web_search`；需要读取某个确定 URL 的正文时调用 `web_fetch`。

例如：

```text
搜索 DeepSeek Harness 最近的发布变化，并附上来源链接。
```

```text
查找今天关于开源 Agent Harness 的重要新闻，比较三个来源。
```

```text
核实某个 GitHub 项目当前的安装方式，并引用官方文档。
```

插件共提供五个模型可见入口：

```text
web_search
web_fetch
anysearch_capabilities
anysearch_search
anysearch_batch_search
```

需要专业数据时，Agent 应先调用 `anysearch_capabilities`。它会读取实时目录，再把返回的标签和参数交给 `anysearch_search`。

需要同时执行多个独立查询时，Agent 使用 `anysearch_batch_search`。一次最多五项，所有项目并发启动，结果仍按输入顺序返回。

例如：

```text
查询 AAPL 最新行情。先获取 finance 领域能力，再使用准确的标签和参数搜索。
```

```text
检索最近的 CVE，并保留 AnySearch 的请求 ID 和搜索耗时。
```

```text
分别搜索三个开源 Agent Harness 的最新版本，并保留每项请求 ID。使用批量搜索。
```

## 如何确认请求正在使用 AnySearch

先检查最终配置：

```bash
npx -y @deepseek-ai/dsh --profile web --dump-config
```

配置中应包含：

```yaml
- id: web
  config:
    searchProvider: anysearch
    fetchProvider: anysearch
```

以及 AnySearch 插件行：

```yaml
- id: web-search-anysearch
  name: '@anysearch/anysearch-dsh'
```

还应确认 `tool-web` 配置包含 `fetch: true`。然后启动 profile，分别提出需要联网搜索和读取确定 URL 的问题。如果 Provider 未注册，Harness 会报告配置的对应 Provider 缺失；如果 AnySearch 返回错误，工具会显示安全错误消息或 HTTP 状态说明。

## 自定义 API 地址

默认 API 地址为：

```text
https://api.anysearch.com
```

如果你使用测试环境或自托管兼容服务，可以在 profile 中提供完整配置：

```yaml
- id: web-search-anysearch
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
    baseURL: https://api.anysearch.com
    maxRenderedContentChars: 12000
```

`apiKeyEnv` 是 DSH 凭据引用，不是 Key 字面量。`baseURL` 必须是 HTTP 或 HTTPS 地址。`maxRenderedContentChars` 只限制一次高级工具调用进入模型的正文；结构化结果另有固定的单次搜索累计 200,000 字符正文上限。

## 结果如何进入模型

AnySearch 搜索响应可能包含标题、URL、摘要和清洗正文。当前 Harness 通用 Web Search 接口只接收可引用的来源字段，因此插件只向 `web_search` 返回 URL 为合法绝对 HTTP(S) 地址的：

- `title`
- `url`
- `snippet`

完整 `content` 不会进入 `web_search` 结果。单条空 URL 或非法 URL 会被过滤，不会导致整次普通搜索失败。这保持了 Harness 通用 Provider 的字段一致性。

`anysearch_search` 始终保留请求 ID 和搜索耗时。没有来源 URL 的垂类结构化结果会保留其 `content`，但不会进入 citation sources。对于带 URL 的网页结果，只有传入 `includeContent: true` 时才保留 `content`。单次搜索所有结果的 `content` 累计最多 200,000 字符，模型文本再展示其中最多 `maxRenderedContentChars` 个字符。元数据中的 `urlLessResults` 和 `droppedInvalidUrlResults` 分别记录无来源 URL 的有效结果数和被丢弃的非法 URL 结果数。

`anysearch_batch_search` 对每项应用相同的 URL 和正文规则。200,000 字符上限按每个独立搜索请求计算；`maxRenderedContentChars` 展示上限由整批共享，不是每项各有一份。

`web_fetch` 调用 AnySearch `/v1/extract`。AnySearch 返回的 HTML 页面已经转换为可读 Markdown，插件把它作为 DSH `text` 正文返回，并保留最终 URL、源站 2xx 状态和 `truncated`。`web_fetch` 使用 DSH 通用结果，因此不会向模型暴露 AnySearch `request_id`、原始媒体类型或标题。

上游业务错误文本会保留至多 2,000 字符，并以 JSON 字符串形式转义，前面固定标记为不可信上游数据而非指令。HTTP 状态、请求 ID 和重试等待时间仍作为安全诊断字段保留。

批量搜索发出多次独立 HTTP 请求。每项单独鉴权、限流和计费；单项失败不会丢弃其他成功项。

插件不注册重复的 `anysearch_extract` 工具；AnySearch Extract 通过 Harness 原生 `web_fetch` 提供。

## 常见问题

### 不配置 API Key 能用吗？

可以。插件会省略 `Authorization` 请求头并使用匿名额度。匿名额度耗尽或触发限流后，需要稍后重试或配置 API Key。

### 修改 Key 后需要重启吗？

修改 `.credentials.yaml` 不需要重启，下一次搜索会重新解析并使用新值。修改启动环境变量需要重启 DSH 进程，因为运行中的进程不会重新读取父进程环境。

### 为什么 `--dump-config` 看不到真实 Key？

这是预期的安全行为。插件配置只保留 `ANYSEARCH_API_KEY` 引用；真实值由 DSH credentials Provider 在操作开始时解析，不进入 Cordis 配置输出。

### 普通查询应该使用哪个工具？

普通查询使用 `web_search`。需要读取一个确定 URL 的正文时使用 `web_fetch`。只有垂直标签、结构化参数或完整搜索元数据有价值时，才使用 `anysearch_search`。

### 当前可以使用垂直搜索吗？

可以。先调用 `anysearch_capabilities` 获取实时标签和参数，再调用 `anysearch_search`。不要自行猜测 `tag` 或参数名。

### 当前可以使用批量搜索吗？

可以。调用 `anysearch_batch_search`，传入一至五个搜索项。插件并发执行各项、保持输入顺序，并在结果中分别标记成功或失败。

### 当前可以提取完整网页吗？

可以。调用 Harness 原生 `web_fetch` 并传入一个公开 HTTP(S) URL；插件会通过 AnySearch HTTP Extract 返回清洗正文。该入口只接受 URL，不提供格式、提示词或 LLM 摘要参数。

### 为什么搜索结果和直接调用 HTTP 的 JSON 不完全相同？

所有插件搜索入口都调用 AnySearch `/v1/search`。`web_search` 只保留通用来源字段；专属工具保留完整结构化结果和元数据。

### 出现 `WEB_PROVIDER_ERROR` 怎么办？

依次检查：

1. `baseURL` 是否正确；
2. 当前网络能否访问 `api.anysearch.com`；
3. API Key 是否有效、禁用或过期；
4. 是否已用完匿名或账号额度；
5. AnySearch 服务是否返回了 429 或 5xx。

报告问题时请提供错误消息和发生时间，不要提供真实 API Key。

## 功能边界

网页正文提取通过 Harness 原生 `web_fetch` 提供。API Key 请通过 DSH 管理的凭据文件或环境变量配置；可用功能和调用方式以本仓库发布版本及 AnySearch 公开 API 文档为准。

## 相关链接

- [AnySearch 官网](https://anysearch.com)
- [AnySearch 文档](https://anysearch.com/docs)
- [AnySearch MCP Server](https://github.com/anysearch-ai/anysearch-mcp-server)
- [AnySearch Skill 安装](https://anysearch.com/install/skill-install.md)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
