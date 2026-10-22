# Local commands and boundaries

Snapshot: bec5d5daf945df78464e4535c47628809ef8ca64. Cwd for Git reads: <HOME>/_projects/delendai. Every Git/CLI command sets DELENDAI_AGENT_ID=gpt-6.1-sol.

1. `python3 proposals-services/read.py 650` repeatedly read each remaining range, not sampling. Three earlier full reads are materialized in prior-completed-source.log. read-*.log retains sequential source.
2. `python3 proposals-services/read-selected.py <five explicit spec paths>` retained full pertinent test sources in selected-read-*.log.
3. `bun --tsconfig-override /tmp/delendai-audit-finish-20261020/usage/snapshot/tsconfig.base.json /tmp/delendai-audit-finish-20261020/proposals-services/probe.ts > probe-output.log 2>&1`. Production helper modules come from the existing fixed Git archive; fake Git runner records requested argv but performs no command. Bun printed a post-execution internal directory-mismatch diagnostic after the expected JSON cases; the complete output is retained, not hidden. Treat these as executed helper results with a runner diagnostic, not a clean full-tool test run.
4. `python3 proposals-services/stale-query.py > stale-query-output.log`. Extracts the exact production SQL predicate via git show and runs it on two synthetic rows in Python stdlib SQLite :memory:. No file/application database or migrations.
5. `node <HOME>/_projects/delendai/node_modules/vitest/vitest.mjs run --config /tmp/delendai-audit-finish-20261020/usage/snapshot/proposals-services-audit.vitest.ts --reporter=verbose > tests-output.log 2>&1` passed3specs/16tests. Fixed workspaceAliases resolve extracted snapshot source, a custom setup rejects all fetch, and only owned temporary fixtures are written.
6. `python3 proposals-services/finalize.py` builds semantic counts and source trace artifacts from already inspected fixed objects; it does not imply further runtime verification.

No application DB, provider, credentials, browser/VSCode host or network request was used. No repository file, claim, branch or commit was changed.
