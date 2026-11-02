#!/usr/bin/env bun
/**
 * bin/delendai-shim.ts — b00239 S3 (legacy bridge shim).
 *
 * The `delendai` legacy bin name kept alive for one release after
 * the rebrand so workspaces whose local scripts and CI invoke the
 * old name keep working without edits. See `delendai.ts` for the
 * forwarding rationale — this shim is the same forwarding logic
 * bound to a different legacy name.
 *
 * The filename is `delendai-shim.ts` (NOT `delendai.ts`) so that
 * the filesystem, the build system, and any developer tooling can
 * distinguish the two shims unambiguously. The `package.json#bin`
 * mapping is what makes `delendai` and `delendai` resolve to the
 * canonical `dist/index.js` and to this shim respectively.
 */
import { spawn } from 'node:child_process';

const canonical = 'delendai';

const child = spawn(canonical, process.argv.slice(2), {
	stdio: 'inherit',
});

child.on('exit', (code) => {
	process.exit(code ?? 1);
});
child.on('error', (err) => {
	process.stderr.write(
		`delendai bridge: cannot find canonical '${canonical}' on PATH: ${err.message}\n`,
	);
	process.exit(127);
});
