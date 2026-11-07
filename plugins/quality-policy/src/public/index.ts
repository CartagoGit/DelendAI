/**
 * Public surface of `@delendai/quality-policy`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the tool builder, output schema and types for programmatic reuse.
 */
export { default } from '../index';

export {
	buildQualityPolicyToolRegistrations,
	QualityPolicyOutputSchema,
	runQualityPolicy,
} from '../lib/tools/quality-policy.tool';
export type {
	IQualityPolicyArea,
	IQualityPolicyCoverageThreshold,
	IQualityPolicyEntry,
	IQualityPolicyOutput,
	IQualityPolicyPluginOptions,
	IQualityPolicyPresetSignal,
	IQualityPolicyRoleSample,
	IQualityPolicyToolArgs,
	IQualityPolicyToolOptions,
} from '../lib/contracts/interfaces/quality-policy.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
