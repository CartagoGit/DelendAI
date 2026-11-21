# Remote Provider Diagnostics

This document describes the conceptual integration for reusable remote CI
diagnostics across GitHub and GitLab.

## Scope

The remote diagnostic flow is read-only. It resolves a remote repository or
project, selects a workflow run or pipeline, gathers bounded job evidence,
correlates commit/ref/review context and returns a shared diagnostic result.

It does not:

- retry or cancel a pipeline or workflow
- comment on a pull request or merge request
- require a local checkout
- require the `git`, `logs`, `proposals`, `quality` or `notification` plugins

## Shared model

The common model lives in `@delendai/contracts/remote-diagnostics` and the
shared engine lives in `@delendai/remote-provider-core`.

The provider adapter is responsible for converting native provider evidence into
that model:

- project or repository identity
- ref and commit metadata
- pull request or merge request context when available
- workflow run or pipeline execution status
- failed or otherwise relevant jobs
- bounded logs and truncation metadata
- artifact metadata and useful web/API URLs

The engine then produces one consistent result shape with:

- evidence availability: complete, partial or unavailable
- a selected run with correlated jobs and artifacts
- a human-readable summary
- a probable cause based on the available evidence
- a proposed fix separated from any mutation capability

## Provider adapters

GitHub and GitLab each expose a concrete adapter that reuses the existing
provider HTTP client instead of creating a second transport layer.

### GitHub

`diagnoseGitHubWorkflow(...)` uses the GitHub plugin's current authenticated
client and reads:

- workflow runs
- one selected workflow run
- jobs for that run
- bounded job logs
- workflow artifacts
- commit metadata
- optional pull request metadata

The adapter maps GitHub Actions states and conclusions into the shared execution
status model without importing mutation code.

### GitLab

`diagnoseGitLabPipeline(...)` uses the GitLab plugin's current authenticated
client and reads:

- pipelines
- one selected pipeline
- jobs for that pipeline
- bounded job traces
- artifact metadata carried by jobs
- commit metadata
- optional merge request metadata

The adapter maps GitLab pipeline and job states into the shared execution status
model without importing mutation code.

## Optional composition

The diagnostic flow supports optional composition with other capabilities, but
the diagnostic adapters stay independent.

### git + github

When `git` is available, the caller may enrich a GitHub diagnosis with local
branch, SHA, remotes or a diff. The GitHub adapter still works when `git` is
absent or when there is no checkout.

### git + gitlab

When `git` is available, the caller may enrich a GitLab diagnosis with local
branch, SHA, remotes or a diff. The GitLab adapter still works when `git` is
absent or when there is no checkout.

### Conceptual integration only

These integrations are intentionally conceptual and optional:

- `logs` can store or forward the final report
- `proposals` can turn the proposed fix into tracked work
- `quality` can verify a human-approved remediation
- `notification` can announce the final diagnosis or handoff

None of those plugins are runtime dependencies of the adapters.

## Operating limits

The adapters preserve the shared bounded-evidence discipline:

- log payloads remain bounded by byte, line and duration limits
- only the most relevant jobs should be inspected in detail
- large evidence sets degrade to partial, not unbounded, output
- useful web or API URLs are preserved when available

The result is a portable diagnosis surface for remote CI failures that remains
safe to run in remote-only environments.