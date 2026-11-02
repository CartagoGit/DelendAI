#!/usr/bin/env bun
/**
 * bin/delendai.ts — b00239 S3 (legacy bridge shim).
 *
 * The `delendai` legacy bin name kept alive for one release after
 * the rebrand so workspaces whose local scripts and CI invoke the
 * old name keep working without edits. The shim is a one-line
 * forwarder: it re-execs the canonical `delendai` binary with the
 * same argv. The canonical entrypoint already runs the S2 migration
 * guard, so the migration behaviour is preserved without a second
 * implementation.
 *
 * The filename is `delendai.ts` (matching the legacy bin name) and
 * is paired with `delendai-shim.ts` for the other legacy name. Both
 * are bundled as build entries (see `tools/scripts/compile/build.script.ts`)
 * and the canonical `package.json#bin` entry remains `delendai` only
 * (S1 invariant — declaring legacy names in `bin` would re-introduce
 * the install-time collision).
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
