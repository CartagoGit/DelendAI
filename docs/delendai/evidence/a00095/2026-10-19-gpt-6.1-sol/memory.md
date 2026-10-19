# Memory: individual plugin review

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

All 32 production source files were read, together with metadata and three selected complete specs. Nine tools were observed through the actual core/SDK composition. Native tools/list contains 8,212 UTF-8 bytes of tool objects; builder capture has a different projection and must not be substituted for wire measurement. These are bytes, not billed conversation tokens.

Three P2 defects were reproduced: different titles release/v1 and release-v1 overwrite the same note; updating a session digest leaves its freshness based on its original creation time; bytesAvoided counts returned bytes without an observed avoided-read baseline. The title collision was also exercised through the real SDK server. Mutex-protected RMW, quota enforcement and atomic writes are positive findings. Import metadata validation and the TTL corruption path agree with D88/D90.

Provisional score: **6.5/10**. The original includes all six required dimensions, causes, expected versus observed behavior, replay instructions and limitations. No host compaction, provider billing, Windows behavior or complete matrix of error calls was certified.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/memory.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)

## Original finding references

The identifiers below retain existing deep links. Their detailed arguments are in the complete original and structured finding record.

<a id="g61-mem01"></a>

`g61-mem01`: [complete original](evidence/reviewer-originals/memory.source.es.txt).

<a id="g61-mem02"></a>

`g61-mem02`: [complete original](evidence/reviewer-originals/memory.source.es.txt).

<a id="g61-mem03"></a>

`g61-mem03`: [complete original](evidence/reviewer-originals/memory.source.es.txt).
