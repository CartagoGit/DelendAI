# Round context and selected recovery/shipping helpers

Snapshot `bec5d5daf945df78464e4535c47628809ef8ca64`; reviewer gpt-6.1-sol. **9/9 production files, 1,362 lines fully read**, complete hashes/ranges in `coverage.json`. Exact agreed scope: six round-context files, runtime-recovery, slice-cited-commits and slice-shipping-record. No additional swarm family was claimed read. The targeted tool-output caller was read through line 150 and locally exercised.

| Dimension | Score / 10 | Basis |
|---|---:|---|
| Functionality | 6 | Digest/recovery/shipping implemented; canonical portfolio fallback incomplete. |
| Architecture | 7 | Pure derivation and explicit filesystem collection separated; publication atomic. |
| Reliability/contracts | 5 | Missing/unreadable collapse and partial shape validation; canonical status count wrong. |
| Governance/privacy | 7 | These helpers are advisory and read-only except explicit digest/shipping publication; no provider execution path. |
| Test/evidence | 5 | Four own local probe outputs; no complete helper suite or property tests executed. |
| Agent efficiency/usability | 6 | Bounded previews and fingerprints reduce context; incomplete portfolio and legacy vocabulary reduce trust. |
| **Overall, assigned helpers only** | **6.0** | Not the whole proposals plugin score. |

PROP-ROUND01 is confirmed through the actual output builder: a temporary workspace has two canonical active proposal files, no JSON index, and the forced refresh persists activeCount 0 with stale:false. The fallback only enumerates the proposals root and extraFolders; it neither recurses nor includes normal status folders by default. sourceState is truthfully missing, but the live fallback completeness is not reported. PROP-ROUND02 is a smaller confirmed metric bug: a canonical in-progress index entry is active yet not counted in inProgressCount.

The helpers provide useful properties: missing files have explicit source states; digests use SHA-derived fingerprints and mutex-protected atomic publication; previews carry overflow counts; shipping records preserve an existing commit and can replace an explicit unrecorded marker; citations are scoped to slice blocks rather than attributing a document-wide commit to every slice. A cited hash is a syntactic citation, not verification that a commit exists or delivered a slice; no such verification was claimed here.

A local helper-only probe also shows buildResumeHint fails to infer a feature prefix from f12345-S1 when activeProposalId is unknown. This is **not elevated**: the production round-context tool supplies activeProposalId through firstToken(fallbackTaskId), which mitigates the demonstrated input shape. Other reviewed limits include source read failures collapsing to missing, digest parsing without runtime schema validation, code-fence handling in citation extraction, and time-based metadata in round identities. No concrete production failure for these was independently demonstrated in this scope.

`probe.ts` uses only new temporary files, the real collector/output builder and pure resume helper; no repository product edits, Git, network, providers or secrets. Four logged cases exit 0; Bun's directory-mismatch diagnostic is retained on stderr. Full plugin tests and host-token/latency measurements remain unexecuted. Snapshot source bytes are shared by a scratch symlink to the earlier exact extraction; every assigned file has its own ledger hash, so copied support files receive no reading credit.
