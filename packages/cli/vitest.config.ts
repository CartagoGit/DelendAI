import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		// f00037 S5: tests are co-located next to the source they cover
		// (`*.spec.ts` next to the implementation). The historical
		// `tests/src/**` mirror was retired by the S4 slice (every
		// test moved next to its source); the directory was removed.
		include: ['src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
		// x00189 s3: the `init:default` end-to-end spec exercises the
		// full pipeline (template write, scaffold, init docs) which
		// crosses the 5s default under vitest 4's pool startup, so the
		// ceiling was widened project-wide. The hook timeout gets the
		// same treatment (interleaved with the test).
		//
		// Raised 30s -> 120s after that spec timed out in a full
		// `validate` run. Measured on an idle machine, the end-to-end
		// test costs 4.9s, so 30s was a 6x margin — but a full run
		// executes 1466 test files in parallel and inflates transform
		// time several-fold, which is exactly the "coin flip whenever
		// the machine is busy" failure `tools/vitest.config.ts` and
		// `plugins/proposals/vitest.config.ts` both document. Note the
		// two share that REASONING but not the number: tools/ is the
		// only config that had already concluded 120s, proposals/ sits
		// at 30s. A genuine hang still fails, it just takes longer to
		// say so.
		//
		// Lowered 120s -> 60s after v00137 (2026-09-15), from measurements
		// rather than hope. The `init:default` end-to-end test no longer
		// imports every enabled plugin's runtime to read static env
		// markers: back-to-back on the same machine it went from 6138ms /
		// 5939ms to 127ms / 170ms, and the spec's module transform time
		// from ~70s to ~3.5s. It is no longer this project's slowest test —
		// that is now `doctor.spec.ts › completion bash` at ~6.0s idle.
		//
		// The ceiling is sized to THAT test, not to the one that got fast.
		// The note above records a full run inflating a 4.9s test past
		// 30s, i.e. more than 6x; 60s is 10x the slowest test now in the
		// project, above the inflation already observed. Going lower would
		// be choosing a number the evidence does not support.
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
