# Validation results and limits

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

The full test sweep finished: 2,105 files (2,089 pass, 15 fail, one skipped), 16,912 tests (16,899 pass, five fail, eight skipped). After restoring isolated Git metadata and already-installed dependency links, the 15 affected suites passed in a focused rerun: 162 tests. Do not add overlapping counts or claim a second complete green run.

The Bun/SQLite sweep reported 477 pass and two failures caused by forced CI without the fixture commit identity. A normal local rerun passed all four tests in those two files. Product sources and gates were unchanged. The proposal lint and whitespace checks passed. The language gate required English navigation pages; complete Spanish reviewer originals are preserved as byte-identical evidence attachments.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/validation.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)

## Language policy verification

The prior CI run rejected Spanish prose in documentation outside the bilingual proposal tree. This was a documentation-language failure, not a finding of malicious activity. The unchanged repository language gate now reports zero violations. Forty complete signed Spanish originals remain byte-identical source attachments, with per-file SHA-256 and explicit English navigation. No exclusions or baselines were added. Original-byte preservation and all navigation links were checked.

The full tracked-file secret scan also passed after staging the preserved originals: zero new findings, with the existing 37-entry baseline unchanged. Whitespace checks passed for both staged and working changes. These checks validate the documentary patch; they do not certify the entire product.
