#!/usr/bin/env bun
/**
 * workflow.script.ts — f00049 S10 (workflow-shape lint).
 *
 * Runs every `IWorkflowRule` against the live tree and reports the
 * four "never do" patterns from `plugins/proposals/skills/mcp-vertex-proposal-swarm-runner/SKILL.md`:
 *
 *   1. Hand-edited `docs/mcp-vertex/proposals/index.json` (the regenerator owns it).
 *   2. `main` local head diverges from upstream (push-from-main drift).
 *   3. `mcp-vertex_proposals_sync_proposals` invoked < 60 s after a slice close
 *      by a different agent (race heuristic — noop until MCP telemetry).
 *   4. `auto_work` invoked > 3× in 60 s with no file change (orchestrator
 *      loop heuristic — noop until MCP telemetry).
 *
 * Architecture (SOLID):
 *   - `IWorkflowRule` (interface) — one rule in the chain. Open/Closed:
 *     add a rule by appending to `DEFAULT_WORKFLOW_RULES`, no edit here.
 *   - `IWorkflowContext` (interface) — read-only inputs to every rule.
 *     DIP: tests inject a fake context (no real git, no real cwd).
 *   - `gatherContext(rootDir, depth?)` — pure I/O builder (live git).
 *   - `lintWorkflow(ctx, rules?)` — pure engine over the context.
 *   - `formatReport(findings)` (pure formatter).
 *   - `main()` (CLI shell) — gathers context, runs the engine, formats.
 */
import {
	DEFAULT_WORKFLOW_RULES,
	gatherContext,
	type IWorkflowContext,
	type IWorkflowFinding,
	type IWorkflowRule,
} from './workflow-rules';

export type { IWorkflowFinding } from './workflow-rules';
export type { IWorkflowContext } from './workflow-rules';

export const lintWorkflow = (
	ctx: IWorkflowContext,
	rules: readonly IWorkflowRule[] = DEFAULT_WORKFLOW_RULES,
): readonly IWorkflowFinding[] => {
	const findings: IWorkflowFinding[] = [];
	for (const rule of rules) {
		findings.push(...rule.detect(ctx));
	}
	return findings;
};

export const formatReport = (findings: readonly IWorkflowFinding[]): string => {
	if (findings.length === 0) return 'workflow: 0 findings\n';
	const lines: string[] = [`workflow: ${findings.length} finding(s)`];
	for (const f of findings) {
		lines.push(`  ${f.rule}: ${f.detail}`);
	}
	return `${lines.join('\n')}\n`;
};

/** CLI entrypoint. Side-effecting; isolated from the engine for testability. */
export const main = async (argv: readonly string[]): Promise<number> => {
	const args = argv.slice(2);
	const reportOnly = args.includes('--report');
	const ctx = await gatherContext(process.cwd());
	const findings = lintWorkflow(ctx);
	process.stderr.write(formatReport(findings));
	if (reportOnly) return 0;
	if (findings.length > 0) return 1;
	return 0;
};

// Run when invoked directly (not when imported by tests).
if (import.meta.main) {
	main(process.argv).then((code) => process.exit(code));
}
