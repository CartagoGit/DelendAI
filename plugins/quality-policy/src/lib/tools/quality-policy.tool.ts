import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	compactOutputSchema,
	toolError,
	toolJson,
} from '@mcp-vertex/core/public';

import { QUALITY_POLICY_AREAS } from '../contracts/constants/quality-policy.constant';
import type {
	IQualityPolicyToolArgs,
	IQualityPolicyToolOptions,
} from '../contracts/interfaces/quality-policy.interface';
import { buildQualityPolicyPayload } from '../services/quality-policy.service';

const InputSchema = z.object({
	area: z.enum(QUALITY_POLICY_AREAS).optional(),
});

const CoverageThresholdSchema = z.object({
	lines: z.number().int().min(0).max(100),
	functions: z.number().int().min(0).max(100),
	branches: z.number().int().min(0).max(100),
	statements: z.number().int().min(0).max(100),
});

const PresetSignalSchema = z.object({
	area: z.string(),
	presetId: z.string(),
	reason: z.string(),
});

const RoleSampleSchema = z.object({
	path: z.string(),
	role: z.string(),
});

const QualityPolicyEntrySchema = z.object({
	summary: z.string(),
	mode: z.string().optional(),
	source: z.string().optional(),
	guidance: z.array(z.string()).optional(),
	runner: z.string().optional(),
	mockApi: z.string().optional(),
	evidence: z.string().optional(),
	scopes: z.array(z.string()).optional(),
	presets: z.array(PresetSignalSchema).optional(),
	sampledPaths: z.array(RoleSampleSchema).optional(),
	roleCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
	strict: z.boolean().optional(),
	exactOptionalPropertyTypes: z.boolean().optional(),
	noUncheckedIndexedAccess: z.boolean().optional(),
	noImplicitOverride: z.boolean().optional(),
	tsconfigChain: z.array(z.string()).optional(),
	coverageThreshold: CoverageThresholdSchema.optional(),
	static: z.boolean().optional(),
});

export const QualityPolicyOutputSchema = z.object({
	tests: QualityPolicyEntrySchema.optional(),
	conventions: QualityPolicyEntrySchema.optional(),
	lint: QualityPolicyEntrySchema.optional(),
	types: QualityPolicyEntrySchema.optional(),
	coverage: QualityPolicyEntrySchema.optional(),
	dependsOn: z.array(z.string()),
	bytes: z.number(),
	truncated: z.boolean(),
	originalBytes: z.number().optional(),
});

export const runQualityPolicy = async (
	args: IQualityPolicyToolArgs,
	options: IQualityPolicyToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass area=tests|conventions|lint|types|coverage, or omit it for all policy areas.',
		);
	}
	return toolJson(await buildQualityPolicyPayload(parsed.data, options));
};

export const buildQualityPolicyToolRegistrations = (
	options: IQualityPolicyToolOptions,
): IToolRegistration[] => [
	{
		id: 'quality_policy',
		tags: ['quality', 'policy', 'aggregation', 'compact'],
		summary:
			'Unify cheap tests, conventions, lint, types and coverage policy signals without executing heavy quality runners.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_quality_policy`,
				{
					// `QualityPolicyOutputSchema` is not
					// used as a runtime response validator anywhere in this
					// handler — only declared here as the wire
					// `outputSchema`. It stays exported for behavioural
					// tests; `tools/list` gets the compact envelope
					// instead. The real response payload is unchanged.
					outputSchema: compactOutputSchema(),
					description:
						'Aggregate tests, conventions, lint, types and coverage policy in one bounded response. Reuses pure public helpers from quality, rules, test-policy, test-convention and conventions, and intentionally does not run heavy scanners or quality commands.',
					inputSchema: InputSchema,
				},
				async (toolArgs) => runQualityPolicy(toolArgs, options),
			);
		},
	},
];
