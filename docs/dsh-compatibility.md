# DSH compatibility

<!-- dsh-summary:begin -->
This source tree supports the 29 explicitly tested DSH releases listed
below, from `0.0.1-rc.5` through `0.2.1-alpha.2`, and does not claim
compatibility with untested releases.
These changes target plugin `0.1.8`.
See [npm metadata](https://registry.npmjs.org/@deepseek-ai/dsh) and
[upstream releases](https://github.com/deepseek-ai/deepseek-harness/releases)
for the currently published releases.
<!-- dsh-summary:end -->

The DSH launcher checks component peer ranges before importing a plugin or its
bundle. An unsupported running version blocks loading rather than merely issuing
a warning. Independently versioned Cordis is resolved separately.

## Supported release matrix

<!-- dsh-matrix:begin -->
| Release line | Tested versions |
| --- | --- |
| 0.0.1 | rc.5 |
| 0.1.0 | rc.2, rc.3, rc.6, rc.7, rc.8 |
| 0.1.1 | rc.1, rc.2 |
| 0.1.2 | alpha.2, alpha.3, alpha.4, alpha.5, rc.1 |
| 0.1.3 | alpha.2 |
| 0.1.5 | alpha.1, alpha.2, rc.1, rc.2, rc.3 |
| 0.1.6 | alpha.1, alpha.2 |
| 0.1.7 | alpha.1, alpha.2, rc.1, rc.2 |
| 0.2.0 | rc.1, rc.2 |
| 0.2.1 | alpha.1, alpha.2 |
<!-- dsh-matrix:end -->

The two earlier releases, `0.0.1-rc.1` and `0.0.1-rc.2`, cannot currently be
installed with their complete published peer dependency graphs. Their
`dsh-agent` and `dsh-session` packages require `@deepseek-ai/dsh-type-meta`,
whose npm registry endpoint returns HTTP 404. They are not claimed as verified
compatible. An already bundled desktop may contain that dependency, but needs
separate validation against that actual bundle.

## What the checks prove

`scripts/check-dsh-compat.mjs` packs the built plugin and creates a fresh temporary
project for each release. It pins every DSH dependency and peer in the required
component graph to the requested release, uses the host's declared Cordis and
Schemastery dependencies (including prereleases), installs with strict peer validation,
and type-checks the plugin source against those installed declarations.

The runtime check uses actual released Cordis, credentials interfaces, system
prompt, tool registry, web service, and native web tools. It checks:

- Plugin registration, model-visible schemas, and disposal.
- Native `web_search`, including the old single-query and newer multi-query schemas.
- Native `web_fetch`, both when the plugin supplies it and when the host already has it.
- `anysearch_capabilities`, `anysearch_search`, and `anysearch_batch_search`.
- Credential forwarding and absence of the credential from the assembled prompt.
- Requests and responses through the AnySearch HTTP adapter.

HTTP responses use deterministic fixtures. This is a released-component
integration check, not a live AnySearch API, desktop application, or model-driven
Agent E2E test. The ordinary unit suite remains part of `pnpm run check` and uses
DSH `0.2.1-alpha.2` as its development baseline. The matrix continues to check
older releases. Native search registration adapts to the older and newer
parameter signatures, including query limits and timeouts.

## Run the checks

```sh
pnpm install --frozen-lockfile
pnpm run test:compat

# Select particular releases:
pnpm run test:compat 0.1.0-rc.6 0.2.0-rc.2 0.2.1-alpha.2

# Check the current registry catalog, excluding the two documented unavailable releases:
pnpm run test:compat --published

# Audit all historical releases, including the two expected installation failures:
pnpm run test:compat --all
```

The command prints its temporary evidence directory and preserves a JSON result
list, per-version logs, dependency manifests, lockfiles, and installed packages.
Any failed version produces a nonzero exit code. A failed install or unavailable
dependency is not recorded as a successful runtime check.

CI checks the complete supported matrix for pushes and pull requests. A weekly
scheduled run discovers newly published versions, making unsupported version
ranges or interface changes visible as failures. Future releases require passing
the matrix and updating the peer ranges and version list before being advertised
as supported. Prerelease ranges are explicit because a broad numeric range does
not automatically admit every prerelease series.

## Automated follow-up

`scripts/dsh-compat-versions.json` is the single source of truth. The declared
peer ranges, the release matrix above, the summary at the top, and the README
coverage line are all generated from it by `scripts/update-dsh-compat.mjs`, and
`scripts/check-dsh-compat-declarations.mjs` — part of `pnpm run check` — fails
when any generated value drifts from the list.

The `DSH release follow` workflow runs daily. It lists published DSH releases
that are not supported yet, adds them, rebuilds the distribution, runs
`pnpm run check` and the released-component matrix for the added releases, and
opens a pull request with the result. When the update cannot be verified it
opens an issue instead, because that means a real interface change rather than a
mechanical range bump.

Applying the same update by hand:

```sh
# Published but unsupported releases:
node scripts/update-dsh-compat.mjs --check

# Add one or more releases, then rebuild and verify:
node scripts/update-dsh-compat.mjs 0.2.2-alpha.1
pnpm install && pnpm run build && pnpm run check
```

The job opens the pull request with `GITHUB_TOKEN`, which GitHub does not use to
start further workflow runs. The job therefore runs the full check itself and
records the evidence in the pull request; the repository setting that allows
GitHub Actions to create pull requests must be enabled.

## Git and package installation

The repository includes the compiled JavaScript and declarations in `lib/`.
Installation runs no `prepare`, `prepack`, or install lifecycle scripts, so Git
installs do not require pnpm build permission or a local TypeScript compiler.
After editing source, run `pnpm run build` and include the resulting `lib/`
changes. `pnpm run check` independently compiles into a temporary directory and
fails on missing, extra, or stale build files; it does not silently repair them.
`test:compat` and `test:e2e` enforce the same check before running.

CI installs both a packed package and a complete temporary Git snapshot into
fresh DSH Web profiles on Windows, Linux, and macOS, without compatibility exemptions
or build allowlists. It checks package entries and both composed providers.
To repeat with an installed DSH CLI:

```sh
node scripts/check-dsh-install.mjs /path/to/node_modules/@deepseek-ai/dsh/lib/bin.js
```

This installation check does not contact the AnySearch API or run a model.
The Web profile composes native `web_search` per agent preset; its absence
from the global registry alone does not mean that search is unavailable.

## Desktop versions and issue #12

The plugin does not reject a host based on its CLI or desktop display version.
Its version declarations constrain the DSH component packages supplied by the
host. A missing or placeholder desktop version does not by itself establish
compatibility or incompatibility. For such a host, inspect the actual component
versions and run the tool checks against its bundle.

The plugin therefore has no version-check switch to downgrade to a warning.
If an installer or desktop loader blocks a package, capture its exact error and
component versions. Do not use a forced installation as evidence of compatibility.
