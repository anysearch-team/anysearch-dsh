# AnySearch DSH Installation Guide for AI Agents

Read this guide completely before taking any action. Follow the steps in order and do not invent commands or configuration.

## Safety rules

- Do not request that the user paste an API key into chat.
- Do not print, inspect, or copy the contents of credential files.
- Do not place an API key in commands, source files, Git history, logs, screenshots, or model context.
- Do not overwrite an existing DSH user configuration without the user's approval.
- Do not install or upgrade system prerequisites unless the user authorizes it.

## 1. Check the environment

Windows, Linux, and macOS use the same plugin installation command. Confirm that all three commands below can be run directly from `PATH`:

```sh
node --version
npx --version
pnpm --version
```

The supported runtime is Node.js 22.19 or Node.js 24+, with pnpm 11.7. If a command is missing or a version is unsupported, stop and report the exact prerequisite that needs attention.

## 2. Install the plugin

Install AnySearch into the DeepSeek Harness `web` profile:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
```

Do not use `sudo`, create a second provider entry, or change the profile unless the user explicitly requests it.

## 3. Verify the composed profile

Inspect the final DSH configuration:

```sh
npx -y @deepseek-ai/dsh --profile web --dump-config
```

Confirm that the output selects AnySearch for the existing web provider:

```yaml
- id: web
  config:
    searchProvider: anysearch
```

Also confirm that the AnySearch plugin entry is present:

```yaml
- id: web-search-anysearch
  name: "@anysearch/anysearch-dsh"
  config:
    apiKeyEnv: ANYSEARCH_API_KEY
```

The output must contain only the credential reference `ANYSEARCH_API_KEY`, never a real key. Do not add a second AnySearch provider under a different ID.

## 4. Handle the optional API key

An API key is not required for initial use. Without one, the plugin uses AnySearch's anonymous quota.

If the user needs account-level quota, direct them to sign up or sign in at <https://anysearch.com> and obtain a key from <https://www.anysearch.com/console/api-keys>. Ask the user to store it outside the conversation in `$DSH_HOME/.credentials.yaml`, whose default location is `~/.dsh/.credentials.yaml`:

```yaml
ANYSEARCH_API_KEY: "as_sk_your_key"
```

The value above is a placeholder. Never ask the user to reveal the real value, and never read the credential file back for verification. After the user confirms that the credential is stored, rerun `--dump-config` only to verify the reference name.

## 5. Start DeepSeek Harness

Start the `web` profile:

```sh
npx -y @deepseek-ai/dsh web
```

The plugin automatically powers Harness's native `web_search` tool and mounts the advanced AnySearch tools. No configuration change is required by default.

## 6. Report completion

Tell the user:

- whether the prerequisite checks passed;
- whether the plugin installation completed;
- whether the composed profile selected `searchProvider: anysearch`;
- whether Harness started successfully;
- that anonymous quota is active unless the user configured an API key.

Do not include full configuration dumps, credential-file contents, or sensitive values in the report.
