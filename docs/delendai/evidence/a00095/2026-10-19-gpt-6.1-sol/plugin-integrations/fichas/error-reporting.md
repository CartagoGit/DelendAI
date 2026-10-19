# Error reporting: evidence checkpoint

Auditor: `gpt-6.1-sol`. Code snapshot: `514758e783620c8953079be4d71fceccacb3de8b`. This is a partial individual card; it does not establish exhaustive source coverage or a completed plugin score.

## Functionality and contracts

The plugin classifies observed tool failures, prepares a privacy-filtered report, and exposes local status and log diagnosis. External issue submission depends on the reporter and its authenticated permissions. The inspected default, manifest and documentation disagree about opt-in versus default activation. A tool being registered does not prove that external delivery was exercised.

## Isolation and privacy

ER-01 demonstrates that a project-owned error object can supply a stack containing a fabricated `@delendai/` package name. The production transformation classifies it as internal and the privacy validator accepts that identifier. The reproduction stops before network or issue creation. It establishes classifier/DTO behavior, not arbitrary content disclosure or a demonstrated remote submission.

ER-02 records the conflicting activation defaults. ER-03 records a mismatch between the per-tool permission map and the two registered tools. The latter is metadata/host-integration debt; no runtime authorization bypass was demonstrated.

## Quality and evidence

The recorded focused suite passed 25 files and 161 tests. Its original command, scope and loader warning are preserved in [validation.log](../../evidence/error-reporting/validation.log); these counts are not added to overlapping global test counts. A complete per-file reading ledger remains pending.

<a id="er-01"></a>

**ER-01:** [classification, call path, reproduction and limits](../../evidence/error-reporting/project-stack-spoof.md); [script](../../evidence/error-reporting/repro-project-stack-spoof.ts) and [output](../../evidence/error-reporting/repro-project-stack-spoof.log).

<a id="er-02"></a>

**ER-02:** [runtime defaults versus adopter/model-facing documentation](../../evidence/error-reporting/default-consent-contradiction.md).

<a id="er-03"></a>

**ER-03:** [registered tools versus permission metadata](../../evidence/error-reporting/per-tool-permission-map.md).

## Token cost and product judgment

No fresh wire-byte measurement was performed for this plugin. Do not infer token savings from local report counters. Useful local diagnosis should remain clearly distinct from external reporting, with consistent defaults, trustworthy package provenance, and accurate permission metadata. A numerical score is withheld until the remaining coverage and contract checks are completed. No product changes, provider credentials or external issue submissions are part of this audit.
