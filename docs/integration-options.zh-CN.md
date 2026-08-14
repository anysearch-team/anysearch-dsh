# AnySearch DSH 插件与 Skill、MCP、HTTP 接入方式对比

最后核对：2026-08-14

## 先说结论

这四种方式调用的是同一个 AnySearch 产品能力，但解决的问题不同：

- 使用 DeepSeek Harness，希望安装后直接替换内置 `web_search`：选择 `@anysearch/anysearch-dsh`。
- 使用支持 Skill 的 Agent，希望用一组跨平台命令获得 AnySearch 全部工具：选择 AnySearch Skill。
- 客户端原生支持 MCP，希望自动发现并调用完整工具集：直接连接 AnySearch MCP。
- 开发自己的应用或 Agent，需要完全控制请求字段、结构化响应和产品 UI：直接调用 AnySearch HTTP API。

`@anysearch/anysearch-dsh` 不是另一套搜索后端，也不会改变 AnySearch 的搜索数据源。对于相同 API Key、相同 `/v1/search` 参数和相同服务状态，搜索计算仍由 AnySearch 完成。差异主要来自客户端如何选择工具、开放哪些字段、如何处理返回结果，以及如何执行批量搜索和 Extract。

## 总览

| 维度 | DSH 插件 | AnySearch Skill | AnySearch MCP | 直接 HTTP |
|---|---|---|---|---|
| 主要用户 | DeepSeek Harness 用户 | 支持 Skill 和本地命令的 Agent | 原生 MCP 客户端 | 应用、服务和自研 Agent 开发者 |
| 接入位置 | Harness `ctx.web` 和专属工具 | Skill 指令与跨平台 CLI | MCP 工具协议 | REST API |
| 当前通用搜索 | 支持 | 支持 | 支持 | 支持 |
| 当前垂直搜索 | 支持 | 支持 | 支持 | 支持 |
| 当前批量搜索 | 支持；客户端最多五路并发 | 支持 | 支持 | 客户端自行并发 |
| 当前 Extract | 不支持 | 支持 | 支持 | 以公开 HTTP API 文档为准 |
| 能力发现 | `anysearch_capabilities` | `get_sub_domains` 命令 | `get_sub_domains` 工具 | `/v1/domains`、`/v1/sub-domains` |
| 返回形式 | 原生来源或结构化工具结果 | CLI 文本 | MCP tool result | 结构化 JSON |
| Harness 原生 UI | 最好 | 作为外部命令输出 | 取决于 MCP Host | 需要自行实现 |
| 凭据管理 | DSH 凭据引用；配置不含 Key | 由 Skill 运行环境管理 | 由 MCP Host 管理 | 应用自行管理 |
| Key 轮换 | 受管文件修改后，下次搜索生效 | 取决于 CLI 进程与环境 | 取决于 MCP Host | 由应用实现 |
| 自定义请求控制 | 支持当前搜索字段 | 由 Skill CLI 参数决定 | 由 MCP schema 决定 | 最高 |
| 安装复杂度 | DSH 内安装一次 | 安装 Skill 和运行时 | 配置远程 MCP | 编写客户端代码 |
| 跨 Agent/客户端复用 | 限于 DSH | 较好 | 支持 MCP 的客户端 | 取决于自研封装 |
| 协议层 | HTTP `/v1/search` 和能力目录 | 当前 CLI 包装 `/mcp` JSON-RPC | Streamable HTTP MCP | 普通 HTTP JSON |

表中的 DSH 插件能力以当前 `0.1.1` 和公开文档为准。

## 一、DSH 插件

### 它做什么

`@anysearch/anysearch-dsh` 把 AnySearch 注册为 DeepSeek Harness 的 Web Search Provider。模型仍调用 Harness 内置：

```text
web_search
```

普通搜索把请求转换为：

```http
POST https://api.anysearch.com/v1/search
```

并把 AnySearch 的标题、链接和摘要转换为 Harness 标准来源。

专业检索先使用 `anysearch_capabilities` 获取实时标签，再使用 `anysearch_search` 发送完整字段。高级工具保留请求 ID、耗时和清洗正文。

### 优点

- 与 Harness Provider 选择、工具 schema、引用输出和 UI 原生集成；
- 普通搜索不增加第二个工具，模型选择更简单；
- 用户不需要维护 MCP Server 配置或 Skill 运行命令；
- 插件配置只保存 `ANYSEARCH_API_KEY` 引用，真实值由 DSH credentials Provider 解析；
- 每次操作重新解析一次凭据，受管文件中的 Key 轮换在下一次调用生效；
- 请求取消、错误和插件生命周期遵循 Harness 机制；
- 已提供 AnySearch 专属结构化工具，同时保留默认 `web_search`。

### 当前限制

- 通用 `web_search` 仍只开放 `query` 和结果数量；
- 清洗正文和完整元数据需要使用 `anysearch_search`；
- 没有 Extract；
- 当前 DSH Web 设置页不会自动为第三方 Provider 生成 AnySearch Key 输入框，需要使用 DSH 受管凭据文件或环境变量；
- 只适用于 DeepSeek Harness。

### 适合谁

- 已使用 DeepSeek Harness；
- 希望 AnySearch 成为默认搜索 Provider；
- 更看重原生工具体验、展示和引用；
- 可以接受高级能力分阶段发布。

使用方法见[DSH 插件使用指南](user-guide.zh-CN.md)。

## 二、AnySearch Skill

### 它做什么

AnySearch Skill 为支持 Skill 的 Agent 提供说明文档和 Python、Node.js、PowerShell、Shell 等跨平台 CLI。Agent 根据 Skill 指令运行：

```text
search
get_sub_domains
batch_search
extract
```

截至本次核对，Skill CLI 通过 JSON-RPC `tools/call` 请求 `https://api.anysearch.com/mcp`，相当于为没有原生 MCP 工具集成、但能够执行本地命令的 Agent 提供一层命令入口。

### 优点

- 可用于多种支持 Skill 和 shell 的 Agent，不绑定 DSH；
- 当前即可使用搜索、垂直目录、batch 和 Extract；
- 提供多种运行时脚本，适合不同操作系统；
- Agent 可以通过 Skill 文档理解垂直搜索流程。

### 代价

- 每次调用通常需要启动本地 CLI 进程；
- 当前多一层 CLI 和 JSON-RPC 包装；
- 结果以命令文本为主，Host 很难获得 DSH 原生的结构化卡片和 Provider 体验；
- MCP 工具以 HTTP 200 返回 `result.isError=true` 时，CLI 必须正确识别，不能只把首个文本块当成功；
- Skill 指令较长时会占用 Agent 上下文。

### 适合谁

- Agent 支持 Skill，但不方便配置远程 MCP；
- 希望一个安装包跨多个 Agent 产品使用；
- 当前就需要 Extract；
- 可以接受命令行输出和进程调用。

安装入口：<https://anysearch.com/install/skill-install.md>

## 三、AnySearch MCP

### 它做什么

支持 MCP 的客户端可以直接连接：

```text
https://api.anysearch.com/mcp
```

服务端提供：

- `search`
- `get_sub_domains`
- `batch_search`
- `extract`

客户端通过 MCP 完成工具发现、参数 schema 获取和调用，无需自己了解具体 REST 路由。

### 优点

- 当前公开能力最完整；
- 原生支持 MCP 的客户端无需安装 AnySearch 代码；
- 工具 schema、调用和错误均由统一协议承载；
- 垂直搜索、服务端 batch 和 Extract 已经可用；
- `batch_search` 一次接收多个独立查询，并分别返回各项结果。

### 代价

- 客户端必须支持远程 Streamable HTTP MCP，或通过 `mcp-remote`、`supergateway` 等桥接；
- 展示、引用和权限体验取决于 MCP Host；
- 返回结果以 MCP content block 为主，可能比直接 HTTP JSON 更偏文本；
- MCP 业务失败可能通过 HTTP 200 加 `isError` 表达，不能只检查 HTTP status；
- 对只需要一次普通搜索的自研应用，协议层比 REST 更重。

### 适合谁

- Claude、Cursor、OpenCode 或其他原生支持 MCP 的客户端用户；
- 希望不编写客户端代码就获得完整 AnySearch 工具；
- 当前需要服务端 batch 和 Extract；
- 接受由 MCP Host 决定 UI 和工具权限。

配置和工具说明：<https://github.com/anysearch-ai/anysearch-mcp-server>

## 四、直接调用 AnySearch HTTP API

### 它做什么

应用直接请求 AnySearch Gateway。目前适合外部开发者使用的主要 HTTP 接口为：

```text
POST /v1/search
GET  /v1/domains
GET  /v1/sub-domains
```

`POST /v1/search` 当前请求字段包括：

```text
query
max_results
tag
params
zone
language
format
```

是否提供 HTTP Extract 以及具体调用方式，以 AnySearch 公开 HTTP API 文档为准。

### 优点

- 直接获得结构化 JSON；
- 可以完整控制搜索字段、错误处理、超时、日志和产品 UI；
- 少一层 MCP 或 CLI 包装；
- 容易保留 `request_id`、搜索耗时、清洗正文等字段；
- 适合服务端、SDK、批处理和自研 Agent 工具。

### 需要自己完成

- API Key 和环境配置；
- 凭据存储、访问控制和轮换；
- 参数校验；
- HTTP status 与业务 `code` 的联合错误处理；
- 取消、超时和重定向策略；
- 对 `/v1/search` 的最多五路受控并发；
- 批量结果顺序和部分失败结构；
- 模型工具 schema、提示、结果裁剪、引用和 UI；
- 防止超时或 5xx 重试造成重复执行和额度消耗。

### 适合谁

- 开发自己的 Web、服务端或 Agent 产品；
- 需要精确控制请求和响应；
- 需要结构化数据而不是工具文本；
- 愿意承担客户端工程和后续 API 适配。

文档入口：<https://anysearch.com/docs>

## 五、相同搜索为什么可能表现不同

四种接入最终都可以使用 AnySearch 搜索，但实际结果或体验仍可能不同，常见原因包括：

### 请求字段不同

DSH 的 `web_search` 只发送 `query` 和 `max_results`；`anysearch_search`、Skill、MCP 和直接 HTTP 可以发送垂直标签、结构化参数、区域和语言。同一个问题在垂直路由下可能得到不同来源和排序。

### 工具选择提示不同

MCP 和 Skill 先调用 `get_sub_domains`。DSH 插件使用 `anysearch_capabilities` 完成相同的动态发现，再调用 `anysearch_search`。

### 结果适配不同

直接 HTTP 可以读取完整 JSON；MCP 和 Skill 通常返回格式化文本。DSH 的 `web_search` 只保留通用来源，`anysearch_search` 则保留完整结构化结果。

### Batch 语义不同

MCP `batch_search` 在服务端统一处理多个子查询。DSH 的 `anysearch_batch_search` 发出最多五次独立请求，因此可能部分成功、部分限流或部分额度不足。

### Extract 可用性不同

Extract 当前可通过 MCP 使用；DSH 插件和直接 HTTP 客户端应以公开 HTTP API 文档列出的端点为准。

### 凭据生命周期不同

DSH 插件不把 Key 写进 Cordis 配置，只保存 `ANYSEARCH_API_KEY` 引用。每次操作开始时，DSH credentials Provider 按自身优先级解析真实值；受管文件中的轮换在下一次调用生效。Skill 通常依赖 CLI 环境，MCP 由 Host 管理认证，直接 HTTP 则由应用负责凭据生命周期。

## 六、选择建议

### 已经使用 DeepSeek Harness

优先安装 DSH 插件。它提供原生 `web_search`、垂直搜索和客户端 batch。当前需要 Extract 时，再并行配置 AnySearch MCP。

### 使用支持 MCP 的桌面或编码客户端

优先直接配置 AnySearch MCP。它当前提供最完整的工具集，也不需要维护本地 AnySearch 客户端代码。

### 使用支持 Skill、但 MCP 支持较弱的 Agent

选择 AnySearch Skill。它用跨平台命令把完整能力带入 Agent，但要接受 CLI 进程和文本输出。

### 开发正式产品或服务端

优先直接使用 HTTP API，并自行定义稳定的客户端接口、错误语义、重试和可观测性。不要通过调用 CLI 或解析 MCP 文本来构建业务服务。

### 同时维护多个 Agent 生态入口

可以同时提供：

- MCP 作为通用协议入口；
- Skill 作为命令型 Agent 的兼容入口；
- DSH 插件作为 DeepSeek Harness 原生入口；
- HTTP 作为 SDK 和应用开发入口。

它们不是互相替代的重复项目，而是面向不同 Host 的适配层。关键是让请求字段、错误消息、额度解释和能力状态保持一致。

插件的当前可用方式和操作步骤见[DSH 插件使用指南](user-guide.zh-CN.md)。
