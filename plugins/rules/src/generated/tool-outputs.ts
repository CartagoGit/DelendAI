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

export interface DelendaiRulesApplyRulesOutput {
	mode: string;
	modeGuidance: string;
	area: string;
	framework: string;
	eslintConfigs: string[];
	linterConfigs: string[];
	command: string;
	fixCommand: string;
	steps: string[];
}

export interface DelendaiRulesCheckRulesOutput {
	compact: boolean;
	checks: Array<{
		project: string;
		area: string;
		framework: string;
		eslintConfigs?: string[];
		linterConfigs?: string[];
		typecheckConfigs?: string[];
		command: string;
		typecheckCommand?: string;
		missingEslintDeps: string[];
		missingLinterDeps: string[];
		linter: string;
		installHint: string;
		evidence: {
			effective: "project" | "dogma" | "default";
			command: string;
			rationale: string;
			fromProject?: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
			fromDogma?: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
			fromDefault: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
		};
	}>;
	findings: Array<{
		code: "missing-linter-deps" | "missing-eslint-deps";
		severity: "warning";
		project: string;
		area: string;
		framework: string;
		message: string;
		missing: string[];
		nextAction: string;
	}>;
}

export interface DelendaiRulesGetRulesOutput {
	mode: string;
	modeGuidance: string;
	supported: string[];
	areas: {
		project: string;
		area: string;
		rules?: {
			framework: string;
			presetId: string;
			eslint: string[];
			configs?: string[];
			typecheck: string[];
			reason: string;
		};
		presetId?: string;
	}[];
	conventions?: Record<string, string[]>;
	dogmas?: Record<string, {
		language: string;
		displayName?: string;
		version: string;
		packageManager: string;
		ownership: string;
		errorModel: string;
		nullSafety: string;
		naming: string;
		async: string;
		visibility: string;
		immutability: string;
		testing: string;
		bullets: string[];
	}>;
	renderedDogmas?: Record<string, string>;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface RulesToolOutputs {
	"delendai_rules_apply_rules": DelendaiRulesApplyRulesOutput;
	"delendai_rules_check_rules": DelendaiRulesCheckRulesOutput;
	"delendai_rules_get_rules": DelendaiRulesGetRulesOutput;
}
