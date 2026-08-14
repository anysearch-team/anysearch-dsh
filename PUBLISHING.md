# 发布 `@anysearch/anysearch-dsh` 到 npm

本文用于从另一台 Windows 电脑，以 `anysearch` npm 组织中的主账号首次发布 `@anysearch/anysearch-dsh@0.1.0`。

## 发布目标

- 包名：`@anysearch/anysearch-dsh`
- 版本：`0.1.0`
- npm dist-tag：`latest`
- npm Registry：`https://registry.npmjs.org/`
- Git 提交：发布前确认 `main` 当前 `HEAD`
- Git 标签：发布验证成功后创建 `v0.1.0`

> npm 版本发布后不能覆盖或删除后重新使用。发布前必须确认账号、提交、包内容和版本均正确。

## 1. 准备环境

安装以下工具：

- Git
- Node.js `22.19.0` 或更高版本；推荐 Node.js 24
- PowerShell 7

检查版本：

```powershell
git --version
node --version
npx --version
```

清除可能导致 TLS 校验失效的环境变量，并固定使用 npm 官方 Registry：

```powershell
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
$registry = 'https://registry.npmjs.org/'
```

如果后续命令出现 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告，应立即停止发布，重新打开 PowerShell 后再执行。

## 2. 从已审核提交创建干净工作目录

选择一个新的空目录，不要直接从包含本地改动的工作区打包：

```powershell
$releaseDir = Join-Path $env:TEMP 'anysearch-anysearch-dsh-publish-0.1.0'

git clone --branch main --single-branch https://github.com/anysearch-team/anysearch-dsh.git $releaseDir
Set-Location $releaseDir
$releaseCommit = (git rev-parse HEAD).Trim()

git show --no-patch --format=fuller $releaseCommit

if (git status --porcelain) {
  throw '发布目录不是干净工作区，停止发布。'
}
```

如果 `$releaseDir` 已存在，请换一个新的目录名；不要为了继续操作而删除内容不明的目录。

## 3. 安装依赖并执行发布前检查

项目固定使用 pnpm `11.7.0`。通过 Corepack 执行可以避免依赖电脑上的全局 pnpm 版本：

```powershell
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm run check
```

预期结果：TypeScript 检查、48 个测试和正式构建全部通过。

再次确认包名与版本：

```powershell
node -p "require('./package.json').name + '@' + require('./package.json').version"
```

预期输出：

```text
@anysearch/anysearch-dsh@0.1.0
```

## 4. 生成并核对发布包

```powershell
corepack pnpm pack
Get-FileHash .\anysearch-anysearch-dsh-0.1.0.tgz -Algorithm SHA256
tar -tf .\anysearch-anysearch-dsh-0.1.0.tgz
```

已审核发布包的 SHA-256 为：

```text
55A135CB279AFE317A647C5361EE968CC25A9DE0A486C01910B256146C71448A
```

包内应只有发布所需的 23 个文件，主要包括：

- `package.json`
- `LICENSE`
- `README.md`、`README.zh-CN.md`
- `cordis.patch.yml`
- `docs/integration-options.zh-CN.md`
- `docs/user-guide.zh-CN.md`
- `lib/` 下的 JavaScript 和类型声明

如果哈希或内容不一致，不要发布；先确认是否位于正确提交、是否使用 pnpm `11.7.0`，以及工作区是否干净。

## 5. 登录 npm 主账号

先退出这台电脑可能残留的 npm 账号，然后用已验证可用的 legacy 登录流程登录主账号：

```powershell
npx -y npm@12.0.2 logout --registry=$registry
npx -y npm@12.0.2 login --auth-type=legacy --registry=$registry --strict-ssl=true
npx -y npm@12.0.2 whoami --registry=$registry
```

`whoami` 必须输出准备执行发布的主账号用户名。

确认该账号属于 `anysearch` 组织，并拥有发布权限：

```powershell
npx -y npm@12.0.2 org ls anysearch --json --registry=$registry
```

输出中必须存在当前主账号，角色应允许发布组织包。不要在终端、聊天或截图中展示 npm access token、恢复代码、密码或 `.npmrc` 内容。

## 6. 确认版本尚未发布

```powershell
npx -y npm@12.0.2 view '@anysearch/anysearch-dsh@0.1.0' version --registry=$registry
```

首次发布前，此命令应返回 `E404`。如果已经返回 `0.1.0`，说明该版本已经存在，应停止发布并直接进入验证步骤；不能覆盖同一版本。

## 7. 发布

打开身份验证器，准备一个刚生成的 6 位一次性验证码，然后执行：

```powershell
npx -y npm@12.0.2 publish .\anysearch-anysearch-dsh-0.1.0.tgz `
  --access public `
  --tag latest `
  --registry=$registry `
  --strict-ssl=true
```

终端出现 `Enter OTP:` 时，输入身份验证器当前显示的 6 位数字验证码。

以下内容都不是 OTP，不能输入：

- npm access token
- 2FA 恢复代码
- 密码
- 64 位十六进制字符串

如果验证码即将刷新，等待下一枚验证码生成后再输入。成功时 npm 应输出：

```text
+ @anysearch/anysearch-dsh@0.1.0
```

## 8. 验证 npm 发布结果

发布成功后执行：

```powershell
npx -y npm@12.0.2 view '@anysearch/anysearch-dsh@0.1.0' `
  name version dist-tags dist.shasum dist.integrity `
  --json `
  --registry=$registry

npx -y npm@12.0.2 dist-tag ls '@anysearch/anysearch-dsh' --registry=$registry
```

必须确认：

- `name` 为 `@anysearch/anysearch-dsh`
- `version` 为 `0.1.0`
- `latest` 指向 `0.1.0`
- `dist.shasum` 为 `e2dad0fa2e622d9b1b17744d3e1eee11a4b728f9`
- `dist.integrity` 为 `sha512-f1tXiQmTbFMR89SuZGcgJ++u1P2rx7mwHj8Kiypf3kVj5dFJD3dug7k4uJVYcf5o2RNpUSYVTZn80PMF4u//0A==`

npm Registry 偶尔存在短暂缓存延迟；发布命令明确成功但查询暂时返回 `E404` 时，可以等待一两分钟后重试查询，不要重复执行 `publish`。

## 9. 执行用户安装冒烟测试

使用隔离的 DSH 目录，避免影响电脑上已有的用户配置：

```powershell
$env:DSH_HOME = Join-Path $env:TEMP 'dsh-anysearch-0.1.0-smoke'
New-Item -ItemType Directory -Path $env:DSH_HOME -Force | Out-Null

npx -y @deepseek-ai/dsh plugin --profile web add '@anysearch/anysearch-dsh'
npx -y @deepseek-ai/dsh --profile web --dump-config
```

确认配置中已经加载 `@anysearch/anysearch-dsh`，且没有写入或输出真实 API Key。

## 10. npm 验证成功后创建 Git 标签

只有在 npm 元数据和安装测试均通过后，才创建并推送标签：

```powershell
git fetch origin --tags
git ls-remote --tags origin refs/tags/v0.1.0
```

如果远端没有 `v0.1.0`，执行：

```powershell
git tag -a v0.1.0 $releaseCommit -m 'Release @anysearch/anysearch-dsh 0.1.0'
git push origin v0.1.0
```

最后验证标签确实指向发布提交：

```powershell
git rev-list -n 1 v0.1.0
git ls-remote origin refs/tags/v0.1.0 refs/tags/v0.1.0^{}
```

## 常见错误

### `EOTP`

- 只输入身份验证器生成的当前 6 位数字。
- 检查电脑和手机是否启用自动时间同步。
- 等待下一枚验证码后重新执行发布命令。
- 不要使用恢复代码或 access token 代替 OTP。

### npm 网页显示 `Something went wrong`

使用本文的 CLI legacy 登录方式：

```powershell
npx -y npm@12.0.2 login --auth-type=legacy --registry=$registry --strict-ssl=true
```

### `E403`

依次检查：

- `whoami` 是否为预期主账号。
- 主账号是否属于 `anysearch` 组织。
- 账号是否有发布组织包的权限。
- 账号 2FA 是否已完成启用。
- 发布命令是否包含 `--access public`。

### 版本已经存在

npm 版本不可覆盖。先验证 Registry 上的包是否正确；如果确实需要修复，更新 `package.json` 到新版本，重新审核、构建和发布，不能继续尝试覆盖 `0.1.0`。
