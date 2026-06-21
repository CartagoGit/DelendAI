/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface RulesApplyRulesOutput {
	mode: string;
	modeGuidance: string;
	area: string;
	framework: string;
	eslintConfigs: string[];
	command: string;
	fixCommand: string;
	steps: string[];
}

export interface RulesCheckRulesOutput {
	compact: boolean;
	checks: {
		project: string;
		area: string;
		framework: string;
		eslintConfigs?: string[];
		typecheckConfigs?: string[];
		command: string;
		typecheckCommand?: string;
		missingEslintDeps: string[];
	}[];
	findings: {
		code: "missing-eslint-deps";
		severity: "warning";
		project: string;
		area: string;
		framework: string;
		message: string;
		missing: string[];
		nextAction: string;
	}[];
}

export interface RulesGetRulesOutput {
	mode: string;
	modeGuidance: string;
	supported: string[];
	areas: {
		project: string;
		area: string;
		rules: Record<string, unknown>;
	}[];
	conventions: Record<string, string[]>;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface RulesToolOutputs {
	"rules_apply_rules": RulesApplyRulesOutput;
	"rules_check_rules": RulesCheckRulesOutput;
	"rules_get_rules": RulesGetRulesOutput;
}
