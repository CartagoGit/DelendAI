# State and telemetry: persistence and concurrency

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

All 46 telemetry production files were read. Local repros cover competing drains, loss after a sink rejection, and replacement of a seeded crash-remnant duration journal. Two live processes also demonstrate stale in-memory state replacing SQLite coordination rows in the optional shadow backend. A memo key ignores scope in its in-memory cache; the existing per-compilation consumer limits the observed impact.

The real SDK composition additionally demonstrates a native-mode Zod-union output failure in api_validate, while the same operation succeeds through managed/adaptive resolution. Do not generalize a builder callback result to every server mode.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/state-telemetry.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)

## Original finding references

The identifiers below retain existing deep links. Their detailed arguments are in the complete original and structured finding record.

<a id="g61-mcp01"></a>

`g61-mcp01`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).

<a id="g61-state01"></a>

`g61-state01`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).

<a id="g61-state02"></a>

`g61-state02`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).

<a id="g61-state03"></a>

`g61-state03`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).

<a id="g61-state04"></a>

`g61-state04`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).

<a id="g61-state05"></a>

`g61-state05`: [complete original](evidence/reviewer-originals/state-telemetry.source.es.txt).
