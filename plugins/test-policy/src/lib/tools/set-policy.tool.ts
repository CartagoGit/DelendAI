/**
 * `<prefix>_set_test_policy` — persist a runtime override of the test
 * policy (f00115 S2), or clear it back to the host config / default.
 * The host can disable this tool's writes with
 * `options.allowSetTool: false` (the policy then only changes through
 * `delendai.config.json`).
 */
import z from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';

import {
	isTestPolicyMode,
	POLICY_GUIDANCE,
	resolveTestPolicy,
	TEST_POLICY_MODES,
} from '../policy';
import { clearPolicyOverride, writePolicyOverride } from '../policy-store';
import type { IPolicyToolOptions } from './get-policy.tool';

const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	mode: z.enum(TEST_POLICY_MODES).optional(),
	source: z.enum(['override', 'config', 'default']).optional(),
	guidance: z.array(z.string()).optional(),
	cleared: z.boolean().optional(),
});

export const buildSetPolicyRegistration = (
	options: IPolicyToolOptions,
): IToolRegistration => ({
	id: 'set_test_policy',
	tags: ['testing', 'policy'],
	summary:
		'Override the test-writing policy for this workspace (durable), or clear the override.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_set_test_policy`,
			{
				description:
					'Persists a runtime override of the test-writing policy (survives restarts; wins over the host config until cleared). Pass `mode` to set (`tdd` | `tests-after` | `free` | `none`), or `clear: true` to drop the override and fall back to the host config / tdd default. Refuses when the host set `allowSetTool: false`.',
				inputSchema: z
					.object({
						mode: z.enum(TEST_POLICY_MODES).optional(),
						reason: z.string().max(500).optional(),
						clear: z.boolean().optional(),
					})
					.strict(),
				outputSchema: OUTPUT_SCHEMA,
			},
			async (args: {
				mode?: string | undefined;
				reason?: string | undefined;
				clear?: boolean | undefined;
			}) => {
				if (options.allowSetTool === false) {
					return toolError(
						'Runtime overrides are disabled by the host (allowSetTool: false).',
						'Change plugins.test-policy.options.mode in delendai.config.json instead.',
					);
				}
				try {
					if (args.clear === true) {
						await clearPolicyOverride(options.storeDir);
						const resolved = resolveTestPolicy({
							configMode: options.configMode,
						});
						return toolJson({
							ok: true,
							cleared: true,
							mode: resolved.mode,
							source: resolved.source,
							guidance: [...POLICY_GUIDANCE[resolved.mode]],
						});
					}
					if (!isTestPolicyMode(args.mode)) {
						return toolError(
							`Unknown mode ${JSON.stringify(args.mode)} — expected one of: ${TEST_POLICY_MODES.join(', ')} (or clear: true).`,
							'Call get_test_policy to see the current policy and valid modes.',
						);
					}
					const written = await writePolicyOverride(
						options.storeDir,
						{
							mode: args.mode,
							...(args.reason !== undefined
								? { reason: args.reason }
								: {}),
						},
					);
					return toolJson({
						ok: true,
						mode: written.mode,
						source: 'override',
						guidance: [...POLICY_GUIDANCE[written.mode]],
					});
				} catch (error) {
					return toolError(
						error instanceof Error ? error.message : String(error),
						'Check that the plugin cache dir is writable.',
					);
				}
			},
		);
	},
});
