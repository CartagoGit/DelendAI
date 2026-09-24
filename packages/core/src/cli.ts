#!/usr/bin/env node
import { runCli } from './lib/cli/run-cli';

/**
 * Backward-compatible MCP server entrypoint.
 *
 * The human-facing `delendai` / `delendai` binaries live in
 * `@delendai/cli`; this file stays available for hosts that still
 * start the core MCP server entry directly.
 */
export { assembleCliConfig } from './lib/cli/assemble';
export { runCli } from './lib/cli/run-cli';
export {
	detectIsWsl,
	formatInstallReport,
	parseInitArgs,
} from './lib/cli/run-init';
export type { IAssembleCliDeps, IAssembledCliConfig } from './lib/cli/assemble';

// A git hook asks the project's development policy whether a commit, a
// branch creation or a push may proceed (`delendai guard <hook>`).
export { judgeGitOperation } from './lib/development-policy/git-guard';
export { agentEnvironmentMarker } from './lib/work-identity/agent-environment.helper';
export type {
	IGitGuardVerdict,
	IGuardedGitOperation,
} from './lib/contracts/interfaces/git-guard.interface';

// The block `delendai guard install` adds to a project's git hooks.
export {
	planGuardHook,
	removeGuardBlock,
	renderGuardBlock,
} from './lib/guard-hooks/guard-hook-block.helper';
export {
	GUARD_BLOCK_BEGIN,
	GUARD_BLOCK_END,
	GUARD_CREATED_FILE,
} from './lib/contracts/constants/guard-hooks.constant';
export type {
	IGuardHookEdit,
	IGuardHookName,
	IGuardInvocation,
} from './lib/contracts/interfaces/guard-hooks.interface';

if (import.meta.main) {
	void runCli(process.argv.slice(2), process.cwd());
}
