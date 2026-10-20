# ER-01: project stack can impersonate a first-party package

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

## Reproduction

`repro-project-stack-spoof.ts` passes a tool result with `structuredContent.error` and a sibling `stack` string containing the project path `/workspace/acme-billing/node_modules/@delendai/acme-billing-private/src/charge.ts`. It calls the production `extractObservedFailure` → `asReportableError` → `buildSafeReport` → `validateSafeReport` chain without a registered tool identity or any real `@delendai` package. Result (`repro-project-stack-spoof.log`): `classifiedAsInternal=true`, `packageId=@delendai/acme-billing-private`, the normalized frame preserves that package/project identifier, and `privacyValidation={"ok":true}`. No network or issue submission is performed.

## Call path

`extractObservedFailure` returns the entire `structuredContent` object when it has an `error` key (`report-builder.helper.ts:87–98`). `frame-extractor.helper.ts` accepts a top-level `stack` string on that object and classifies any path containing the literal `node_modules/@delendai/` as an MCP package frame, returning the suffix as `@delendai/<name>/<file>`; it does not verify that `<name>` is a registered first-party package. `classifyInternalError` treats any such frame as positive first-party evidence. The privacy validator checks the `@delendai/` prefix and known sensitive patterns, so the plausible private package name in this fixture passes.

The default observed-failure path then builds and validates the report, claims dispatch, and calls the reporter when the default-enabled plugin receives this result. The resulting issue would contain the fabricated package identifier and normalized frame; the original raw error message and raw host path are not included.

## Impact and limits

A project-owned tool can cause an automatic false internal report and disclose a package/project identifier despite the documented rule that host project identity does not leave the machine. The issue volume remains bounded by dedupe/rate controls; the repro does not prove arbitrary code, environment variables, or source contents can be transmitted. Validate provenance against a trusted package/tool registry or a trusted path allowlist before treating stack text as ownership evidence.
