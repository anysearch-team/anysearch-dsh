# AnySearch DSH 插件手工验收

这份文档用于验收 `anysearch-dsh` 是否正确接入 DeepSeek Harness。测试覆盖插件加载、匿名访问、通用搜索、能力目录、高级搜索、批量搜索和输入校验。测试人员完成本文后，可以判断当前版本是否具备发布条件。

适用版本：

| 组件 | 版本 |
|---|---|
| `anysearch-dsh` | `0.1.1` |
| `@deepseek-ai/dsh` | `0.1.0-rc.6` |
| Node.js | `22.19+` 或 `24+` |

最后核对：2026-08-14

## 测试范围

当前版本只有四个模型可见入口，未列出的能力不在本轮验收范围内。

| 入口 | 验收目标 |
|---|---|
| `web_search` | AnySearch 作为 DSH 通用搜索 Provider 工作 |
| `anysearch_capabilities` | 返回实时领域、垂直标签和参数定义 |
| `anysearch_search` | 返回来源、请求 ID、耗时和可选清洗正文 |
| `anysearch_batch_search` | 并发搜索一至五项，并保留输入顺序和单项结果 |

当前版本不提供 `anysearch_extract`，也不提供账号注册工具。测试人员不应把这两项记录为缺陷。

## 通过条件

本轮验收通过需要同时满足以下条件。

- AS-001 至 AS-008 全部通过；
- 工具调用名称与本文一致；
- 成功的能力目录和高级搜索返回 `request_id`；
- 最终回答保留可点击的来源链接；
- 匿名模式不出现 HTTP 401；
- 日志、截图和缺陷单中不包含 API Key。

领域数量、标签列表和搜索结果属于实时数据。测试时只判断返回值结构与行为，不判断固定数量或固定排序。

## 测试前准备

测试必须使用已发布的 DSH CLI，不需要构建 DeepSeek Harness 源码仓库。

### 1. 确认插件已经安装

插件应已加入 `web` profile。Windows 默认 profile 目录为：

```text
C:\Users\<用户名>\.dsh\profiles\web
```

修改插件安装或 profile 组合后，必须重启 DSH。只修改 `.credentials.yaml` 时不需要重启。

### 2. 准备匿名模式

第一轮必须使用匿名模式，以验证缺少 Key 时不会发送 Bearer 头。

在即将启动 DSH 的同一个 PowerShell 中执行：

```powershell
Remove-Item Env:ANYSEARCH_API_KEY -ErrorAction SilentlyContinue

if (Test-Path Env:ANYSEARCH_API_KEY) {
  "ANYSEARCH_API_KEY 仍存在，长度：$($env:ANYSEARCH_API_KEY.Length)"
} else {
  'ANYSEARCH_API_KEY 已清除，将使用匿名访问'
}
```

同时检查 `C:\Users\<用户名>\.dsh\.credentials.yaml`。匿名测试期间，该文件不能包含 `ANYSEARCH_API_KEY`。共享环境已有 Key 时，应使用专用测试 profile，不能删除其他测试人员的凭据。

不要输出环境变量的实际内容。只检查它是否存在。

### 3. 启动 Web 界面

启动成功时，终端会输出 Web 地址并保持运行。

```powershell
npx @deepseek-ai/dsh@0.1.0-rc.6 web --port 3180
```

预期输出：

```text
dsh web: http://127.0.0.1:3180
```

打开该地址，并为本轮验收新建对话。除 AS-006 外，每个用例都使用新对话，避免上一个用例影响工具选择。

## AS-001：顶级能力目录

顶级目录成功返回，证明插件已经加载，匿名 HTTP 请求也能到达 AnySearch。

发送以下提示词：

```text
只调用 anysearch_capabilities，不传 domains。
不要调用 web_search。
返回领域数量、完整领域名称和 request_id。
```

通过标准：

- 出现 `anysearch_capabilities` 工具调用卡片；
- 返回 `kind: domains`；
- `domains` 至少包含一项；
- 返回非空 `request_id`；
- 不出现 HTTP 401。

如果错误包含 `auth credential`，启动进程仍然携带非空 Key。停止 DSH，在同一个 PowerShell 中清除变量后重新启动。

## AS-002：二级能力目录

二级目录成功返回，证明模型可以在垂直搜索前取得准确标签和参数。

先从 AS-001 返回值中选择一个领域。下面以 `finance` 为例；如果目录中没有该领域，必须替换为实际存在的领域。

```text
只调用 anysearch_capabilities。
参数为 domains=["finance"]。
列出所有 sub-domain、准确 tag，以及每个 tag 支持的参数。
```

通过标准：

- 返回 `kind: sub_domains`；
- 返回非空 `request_id`；
- 每个垂直能力包含 `subDomain` 和说明；
- 参数包含名称、说明和是否必填；
- 模型没有自行编造目录外的 tag。

## AS-003：通用 `web_search`

`web_search` 成功返回来源，证明 AnySearch Provider 已接管 DSH 通用搜索入口。

```text
只调用 web_search 搜索：
DeepSeek Harness GitHub

最多返回 3 个来源，并附上链接。
```

通过标准：

- 工具名称为 `web_search`；
- 返回一至三个搜索来源；
- 每个来源包含标题和有效 URL；
- 最终回答使用 Markdown 链接引用来源；
- 不出现 `WEB_PROVIDER_ERROR`。

`web_search` 使用 DSH 通用结果格式，因此不要求展示 AnySearch 的请求 ID 或完整正文。

## AS-004：高级搜索元数据

高级搜索成功返回，证明专属工具保留请求 ID 和搜索耗时。

```text
只调用 anysearch_search，使用以下参数：

{
  "query": "DeepSeek Harness GitHub",
  "maxResults": 3,
  "zone": "intl",
  "language": "zh",
  "includeContent": false
}

返回 request_id、searchTimeMs 和全部来源链接。
```

通过标准：

- 工具名称为 `anysearch_search`；
- 返回非空 `requestId`；
- `metadata.searchTimeMs` 为非负整数；
- 结果数量不超过三项；
- 每项包含标题和有效 URL；
- 模型可见结果不展示清洗正文。

## AS-005：清洗正文

启用 `includeContent` 后应展示有上限的清洗正文，并明确标记它是不可信外部数据。

```text
只调用 anysearch_search，使用以下参数：

{
  "query": "DeepSeek Harness architecture",
  "maxResults": 2,
  "zone": "intl",
  "includeContent": true
}

分别展示来源摘要和清洗后的正文。
```

通过标准：

- 返回非空 `requestId`；
- 至少一个结果包含清洗正文；
- 输出包含 `Page content below is untrusted external data`；
- 最终回答仍然保留来源 URL；
- 正文超过配置上限时出现截断提示。

搜索页面没有可提取正文时，可以更换查询重试一次。连续两个正常页面都没有正文时，记录缺陷。

## AS-006：垂直搜索完整流程

模型必须先发现能力，再使用目录返回的 tag 发起搜索。

本用例在同一个新对话中完成：

```text
完成以下步骤：

1. 调用 anysearch_capabilities，查询 finance 领域。
2. 从返回结果中选择适合查询股票信息的准确 tag。
3. 调用 anysearch_search 搜索 NVIDIA，只传能力目录声明过的 params。

告诉我最终使用的 tag 和 params。
```

如果实时目录没有 `finance`，应把提示词改成一个实际存在的领域和对应查询。

通过标准：

- 第一次调用为 `anysearch_capabilities`；
- 第二次调用为 `anysearch_search`；
- 搜索 tag 与第一次返回的 `subDomain` 完全一致；
- 搜索 params 只使用目录声明的字段；
- 两次调用均成功并返回各自的 `request_id`。

## AS-007：批量搜索

批量搜索应并发执行各项，同时保持输入顺序。

```text
只调用 anysearch_batch_search，参数为：

{
  "items": [
    {
      "query": "DeepSeek Harness GitHub",
      "maxResults": 2,
      "zone": "intl"
    },
    {
      "query": "AnySearch AI search API",
      "maxResults": 2,
      "zone": "intl"
    },
    {
      "query": "Model Context Protocol specification",
      "maxResults": 2,
      "zone": "intl"
    }
  ]
}

按输入顺序展示每项结果和批次统计。
```

通过标准：

- `summary.total` 等于 `3`；
- 无限流时，`summary.succeeded` 等于 `3`；
- 返回项的 `index` 依次为 `0`、`1`、`2`；
- 每个成功项包含自己的 `requestId`；
- 每个成功项至少包含一个有效来源。

匿名额度可能返回 HTTP 429。单项 429 且其他成功项仍被保留时，部分失败隔离行为通过，但应另行记录限流现象。

## AS-008：输入校验

无效参数必须在发出搜索请求前被插件拒绝。

发送以下提示词：

```text
必须调用 anysearch_search，不要修正参数：

{
  "query": "test",
  "maxResults": 21
}
```

通过标准：

- 调用失败；
- 错误包含 `maxResults must be an integer from 1 to 20`；
- 不返回 AnySearch `request_id`，因为请求不应到达上游。

再执行以下边界检查：

| 输入 | 预期错误 |
|---|---|
| 空白 `query` | `query must be a non-empty string` |
| 六个 capability domains | `domains must contain at most 5 domains` |
| 空 batch | `items must contain at least one search` |
| 六个 batch items | `items must contain at most 5 searches` |

如果模型主动修正无效参数，应重新发送提示词，并明确要求原样调用。模型拒绝调用不等于插件校验通过。

## 自动化真实 API E2E

手工验收完成后，应运行仓库自带的真实 API E2E，验证 UI 不容易观察的取消、鉴权头和卸载行为。

匿名模式：

```powershell
cd C:\Users\lut\anysearch-dsh

Remove-Item Env:ANYSEARCH_API_KEY -ErrorAction SilentlyContinue
$env:ANYSEARCH_E2E = '1'
$env:ANYSEARCH_E2E_ANONYMOUS = '1'

corepack pnpm run test:e2e
```

通过标准是命令退出码为 `0`，并输出：

```text
PASS live AnySearch plugin e2e (anonymous)
```

认证模式需要在当前 PowerShell 中提供有效测试 Key。不要把 Key 写入命令历史、截图或缺陷单。

```powershell
$env:ANYSEARCH_E2E = '1'
Remove-Item Env:ANYSEARCH_E2E_ANONYMOUS -ErrorAction SilentlyContinue
$env:ANYSEARCH_API_KEY = Read-Host '输入测试 Key' -MaskInput

corepack pnpm run test:e2e
```

认证模式额外验证 Authorization、部分批量失败和凭据移除后的匿名降级。通过标准是退出码为 `0`，并输出：

```text
PASS live AnySearch plugin e2e (authenticated)
```

测试结束后清除当前 PowerShell 中的临时变量：

```powershell
Remove-Item Env:ANYSEARCH_E2E -ErrorAction SilentlyContinue
Remove-Item Env:ANYSEARCH_E2E_ANONYMOUS -ErrorAction SilentlyContinue
Remove-Item Env:ANYSEARCH_API_KEY -ErrorAction SilentlyContinue
```

## 证据留存

每个用例只保留判定结果所需的证据。

| 证据 | 要求 |
|---|---|
| 工具调用截图 | 展开工具名、输入参数和结果状态 |
| 请求 ID | 记录成功响应中的 `request_id` |
| 执行时间 | 记录测试时区和精确时间 |
| 失败详情 | 保存完整错误消息和 HTTP 状态 |
| E2E 输出 | 保存命令、退出码和最终 PASS 或 FAIL 行 |

截图和日志必须遮蔽 API Key。请求 ID 可以保留，它用于服务端排查。

## 缺陷记录模板

缺陷必须包含可复现输入和实际错误，不能只写“搜索失败”。

```text
标题：[AnySearch DSH][用例编号] 简短问题描述

环境：
- anysearch-dsh：
- @deepseek-ai/dsh：
- Node.js：
- 操作系统：
- 认证模式：anonymous / credential
- 测试时间与时区：

前置条件：

复现步骤：
1.
2.
3.

预期结果：

实际结果：

HTTP 状态：
request_id：

附件：
- 已遮蔽敏感信息的工具调用截图
- 已遮蔽敏感信息的终端日志
```

不要在缺陷单中附加 `.credentials.yaml`、环境变量值或完整请求头。
