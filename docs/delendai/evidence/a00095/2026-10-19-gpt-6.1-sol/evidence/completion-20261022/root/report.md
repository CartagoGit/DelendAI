# Root packages and latest catalogue delta

The full-reading ledger records all tracked authored files of contracts, SQLite and context-compiler, plus separately inspected catalogue helpers at develop60c3ebc41d5352fc8fe2f58f40505452ee265792. No dependency/dist content earns source credit. The full global matrix remains open.

Contracts: type-only shared interfaces have no Node/core imports; all15 source files pass the existing lint. The3 existing spec files pass8 cases. Their runtime assertions are mostly typed fixtures and do not replace a strict typecheck of consuming code. No new defect was established in this family.

SQLite: both existing files pass6 tests/14 assertions under Bun. Actual Bun and node-adapter helpers both persist synchronous and post-await writes when an async transaction callback rejects: the proposed adapter-parity defect is refuted. This does not certify native Node execution separately, nor promise rollback of an unsupported async callback. No additional SQLite defect is counted.

Context compiler: all16 files inspected;5 existing specs pass13 cases. Actual production helpers over an explicit Map artifact port reproduce the payload in the delta key and the missing hash validation. Source search finds these helpers used internally and in tests, without an external host caller. Scores and impacts must retain that adoption boundary. The documented interface is useful for explicit, limited subagent context, but compactness and content identity are not yet reliable for the two reproduced cases.

Latest catalogue: own fixtures reproduce three malformed-cache/migration failures, extending the existing account-cache finding. Literal null in the new cache now degrades correctly: a partial correction. Changing configured sources while the shared cache is fresh returns the previous source, with an expired-cache positive control that fetches the requested source. All paths include explicit cacheDir and legacyPath; fetch and snapshot ports never contact a provider or a public source.

Agent installation: a separate owned-fixture probe records raw registry identity escaping the installation root and removal of a prior installation before an unpack failure. Every affected sibling directory was created by the probe under its own temporary root. The checksum-rejection control preserves prior content. These observations are pending integration into formal findings, not silently counted here.

No product code, private configuration, provider account or user installation was changed. Original outputs and executable probes are in original-artifacts.tar.gz. The actual scripts contain absolute source locations for this review unit; adapt only that prefix when reproducing against the same source blobs elsewhere.
