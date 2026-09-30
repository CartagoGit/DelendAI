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
// What a refusal says next: how work starts and lands in this profile.
export { briefWorkModel } from './lib/development-policy/declare-workflow';
export {
	DEFAULT_WORK_KIND,
	REVIEW_BATCH_ID,
	WORK_KINDS,
} from './lib/development-policy/profiles.constant';
export {
	isWorkKind,
	isHostApplicationId,
	kindsInAgentId,
	legacyWorkKind,
} from './lib/development-policy/work-ref-placeholders';
export { agentEnvironmentMarker } from './lib/work-identity/agent-environment.helper';
export { AGENT_ENVIRONMENT_MARKERS } from './lib/contracts/constants/agent-environment.constant';
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

// A unit of work, one engine for the CLI's `work` command and the MCP
// `work` tool: entering, checkpointing, claiming and publishing it, and
// the policy it reads.
export { adoptionFor } from './lib/workspace-migration/migrators/development-policy.migrator';
export type { IAdoptedBlock } from './lib/workspace-migration/migrators/development-policy.migrator';
export { runWorkUnit } from './lib/work-units/work-unit.service';
export { EXIT_CODE } from './lib/contracts/constants/exit-code.constant';
export type { IExitCode } from './lib/contracts/interfaces/exit-code.interface';
export type {
	IWorkUnitContext,
	IWorkUnitResult,
} from './lib/contracts/interfaces/work-unit-context.interface';
export {
	configPathFor,
	isRecord,
	readConfigText,
	scalarArg,
} from './lib/work-units/command-args.helper';
export {
	readWorkspaceDocsDir,
	readWorkspacePolicy,
} from './lib/work-units/development-policy.service';
export { openPublicationPullRequest } from './lib/work-units/publication-pull-request.service';
// The gates a project declares: what `delendai validate` runs, and what
// certifies a unit before the merge model lands it.
export {
	packageManagerFrom,
	validationGateSteps,
} from './lib/work-units/validation-gate-steps.service';
export type { IValidationGateStep } from './lib/contracts/interfaces/local-certification.interface';
export {
	checkWorkflowInvariants,
	renderInvariantReport,
} from './lib/work-units/workflow-invariants.service';
export {
	policyOf,
	runWorkflowDoctor,
	sharedCheckoutOf,
} from './lib/work-units/workflow-doctor.service';
export type {
	IInvariantReport,
	IInvariantResult,
	IInvariantScope,
} from './lib/contracts/interfaces/workflow-invariants.interface';
export { worktreeAgent } from './lib/work-units/worktree-agent.service';

if (import.meta.main) {
	void runCli(process.argv.slice(2), process.cwd());
}
