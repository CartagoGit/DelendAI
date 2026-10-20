# G51: diagnosing reads during atomic replacement

Auditor: `gpt-6.1-sol` (Codex). Source snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

Linux/Bun 1.4.2, fixed source snapshot, 1,000 real atomic replacements: SafeWorkspaceReader had 24 ENOENT failures in 41,114 reads. Direct readFile had zero errors in 91,757 reads and direct stat had zero in 95,589. realpath returned 78 paths ending with the literal suffix ` (deleted)`; the safe-reader errors attempted to open/stat that suffixed path.

This confirms a reader/runtime interaction. It does **not** demonstrate a POSIX rename interval with an absent destination or a double grant inside the public claim mutex. The earlier observations remain preserved; their causal interpretation is refined. No Node, other runtime version or other filesystem was tested.

## Complete original and evidence

[Read the complete signed Spanish reviewer source](evidence/reviewer-originals/reader-atomic-diagnosis.source.es.txt). It is preserved byte-for-byte, including all detailed arguments, tables, qualifications and replay commands. This English page is a navigation and scope summary, **not a full translation**. The original remains primary evidence.

The joint proposal is intentionally bilingual. Public documentation pages follow the repository English-language rule; original reviewer material is retained as a source attachment. No gate, exclusion, baseline or product code was changed.

[Current plugin coverage](completion-coverage.json) · [Per-identifier verdicts](prior-findings.json) · [Indexed findings](findings.json) · [Replay evidence hashes](evidence-manifest.json)
