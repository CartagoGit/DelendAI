import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { DEFAULT_QUALITY_POLICY_MAX_BYTES } from './lib/contracts/constants/quality-policy.constant';
import { buildQualityPolicyToolRegistrations } from './lib/tools/quality-policy.tool';

const OptionsSchema = z.object({
	maxBytes: z.number().int().positive().optional(),
});

export default definePlugin({
	name: 'quality-policy',
	version: '0.1.0',
	describe:
		'Unified quality-policy summary across tests, conventions, lint, types and coverage without running heavy quality commands.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`quality-policy plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildQualityPolicyToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				maxBytes:
					parsed.data.maxBytes ?? DEFAULT_QUALITY_POLICY_MAX_BYTES,
			}),
		};
	},
});
