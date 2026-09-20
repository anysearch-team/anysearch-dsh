# DSH compatibility

This source tree targets every currently installable published DSH release listed
below. These changes are not yet published: npm `@anysearch/anysearch-dsh@0.1.5`
still declares the older peer dependency range reported in issue #12.

As checked on 2026-09-20, the DSH npm `latest` and `next` tags point to
`0.1.5-rc.2`; `alpha` points to `0.1.6-alpha.2`. All published DSH versions are
prereleases. Sources: [npm metadata](https://registry.npmjs.org/@deepseek-ai/dsh),
[upstream releases](https://github.com/deepseek-ai/deepseek-harness/releases).

## Supported release matrix

| Release line | Tested versions |
| --- | --- |
| 0.0.1 | rc.5 |
| 0.1.0 | rc.2, rc.3, rc.6, rc.7, rc.8 |
| 0.1.1 | rc.1, rc.2 |
| 0.1.2 | alpha.2, alpha.3, alpha.4, alpha.5, rc.1 |
| 0.1.3 | alpha.2 |
| 0.1.5 | alpha.1, alpha.2, rc.1, rc.2 |
| 0.1.6 | alpha.1, alpha.2 |

The two earlier releases, `0.0.1-rc.1` and `0.0.1-rc.2`, cannot currently be
installed with their complete published peer dependency graphs. Their
`dsh-agent` and `dsh-session` packages require `@deepseek-ai/dsh-type-meta`,
whose npm registry endpoint returns HTTP 404. They are not claimed as verified
compatible. An already bundled desktop may contain that dependency, but needs
separate validation against that actual bundle.

## What the checks prove

`scripts/check-dsh-compat.mjs` packs the built plugin and creates a fresh temporary
project for each release. It pins every DSH dependency and peer in the required
component graph to the requested release, installs with strict peer validation,
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
Agent E2E test. The ordinary unit suite remains part of `pnpm run check`.

## Run the checks

```sh
pnpm install --frozen-lockfile
pnpm run test:compat

# Select particular releases:
pnpm run test:compat 0.1.5-rc.2 0.1.6-alpha.2

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

## Desktop versions and issue #12

The plugin does not reject a host based on its CLI or desktop display version.
Its version declarations constrain the DSH component packages supplied by the
host. A missing or placeholder desktop version does not by itself establish
compatibility or incompatibility. For such a host, inspect the actual component
versions and run the tool checks against its bundle.

The plugin therefore has no version-check switch to downgrade to a warning.
If an installer or desktop loader blocks a package, capture its exact error and
component versions. Do not use a forced installation as evidence of compatibility.
