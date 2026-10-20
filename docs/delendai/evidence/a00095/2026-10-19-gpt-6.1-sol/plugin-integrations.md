# Plugin reviews: integrations and execution adapters

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

Thirteen completed production reads are recorded in the root plugin inventory. API, audit and GitLab have individual cards and local reproductions; external provider behavior remains unverified. The original separates real persistence, fake network seams, static analysis and untested provider/host behavior.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/plugin-integrations.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)

## Original finding references

The identifiers below retain existing deep links. Their detailed arguments are in the complete original and structured finding record.

<a id="g61-mcp01"></a>

`g61-mcp01`: [complete original](evidence/reviewer-originals/plugin-integrations.source.es.txt).


## Additional individual card

- [Error reporting](plugin-integrations/fichas/error-reporting.md): 161 focused tests; three new findings, D114 independently confirmed, and no real GitHub submission attempted.
- [Audit](plugin-integrations/fichas/audit.md): 122 focused tests plus typecheck/build, with four reproduced P2 findings.
- [GitLab](plugin-integrations/fichas/gitlab.md): 11 read-only tools, five opt-in write tools, 113 focused tests, and three new P2 findings.
