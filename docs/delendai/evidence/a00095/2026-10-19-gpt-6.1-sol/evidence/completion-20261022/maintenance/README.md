This directory closes all115 previously pending maintenance sources, fixed958 snapshot. report.md is the assessment, coverage.json its individual reading ledger, findings.json five18-field candidates and extensions.json the existing-cause additions. observations.json preserves non-counted issues. parity-60c.json confirms115/115 identical sources in the merged develop snapshot.

To reproduce outside a product checkout: use prepare-snapshot.py to extract the exact tracked source to this directory and reuse installed dependencies locally. Never run the queue script without the owned executable ports. run-queue.py applies them and writes a separate output directory, preserving original corrected outputs. Core and SQLite probes can run as:

    bun --tsconfig-override ./test-snapshot/tsconfig.base.json ./probes/core.ts
    bun --tsconfig-override ./test-snapshot/tsconfig.base.json ./probes/sqlite-fold.ts
    python3 ./run-queue.py

The existing suite used tests.config.ts, explicit local Vitest executable,43 specs/389 cases, owned archive root, one worker, fake forge PATH and fetch guard. Exact results/config/logs retained. Discarded-first-attempt logs are evidence about failed isolation/configuration, not passing tests or product behavior. Initial four synthetic-path GitHub GET404 attempts had no writes; corrected queue uses only the owned gh executable and blocked Git. Raw initial marker allPortsFake was corrected to false in queue-initial-discarded.json.

Source snapshot/ contains exact115 primary file bytes. test-snapshot/ is an extraction convenience, not an additional source-review claim and need not be copied into audit documents. Tests were executed, not each claimed fully source-reviewed; their exact file hashes and bounded safety review boundary are in test-ledger.json. Supporting caller reads are separately bounded in supporting-reads.json.
