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

export interface DelendaiQualityPolicyQualityPolicyOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiQualityPolicyRunSettlementOutput {
	ok?: boolean;
	[key: string]: unknown;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface QualityPolicyToolOutputs {
	"delendai_quality-policy_quality_policy": DelendaiQualityPolicyQualityPolicyOutput;
	"delendai_quality-policy_run_settlement": DelendaiQualityPolicyRunSettlementOutput;
}
