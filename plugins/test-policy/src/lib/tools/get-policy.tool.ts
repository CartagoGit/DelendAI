/**
 * `<prefix>_get_test_policy` — report the active test-writing policy
 * (f00115 S2): resolved mode, where it came from, and the imperative
 * guidance the agent must follow. Read this before writing any code
 * that changes behaviour.
 */
import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	POLICY_GUIDANCE,
	resolveTestPolicy,
	TEST_POLICY_MODES,
	type ITestPolicyMode,
} from '../policy';
import { readPolicyOverride } from '../policy-store';

export interface IPolicyToolOptions {
	readonly namespacePrefix: string;
	/** Absolute dir holding the durable override (`policy.json`). */
	readonly storeDir: string;
	/** Mode from the host config, when declared. */
	readonly configMode?: ITestPolicyMode | undefined;
	/** Free-text extra guidance from the host config. */
	readonly extraGuidance?: string | undefined;
	/** When false, `set_test_policy` refuses to write (default true). */
	readonly allowSetTool?: boolean | undefined;
}

const OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	mode: z.enum(TEST_POLICY_MODES).optional(),
	source: z.enum(['override', 'config', 'default']).optional(),
	guidance: z.array(z.string()).optional(),
	extraGuidance: z.string().optional(),
	overrideReason: z.string().optional(),
	overrideSetAt: z.string().optional(),
});

export const buildGetPolicyRegistration = (
	options: IPolicyToolOptions,
): IToolRegistration => ({
	id: 'get_test_policy',
	tags: ['testing', 'policy'],
	summary:
		'Return the active test-writing policy (tdd/tests-after/free/none) with its agent guidance.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_test_policy`,
			{
				description:
					'Returns the test-writing policy the workspace expects agents to follow: the resolved mode (`tdd` = failing tests first, `tests-after` = cover before closing, `free` = agent decides and states it, `none` = no new tests), where it came from (runtime override > host config > default tdd) and the imperative guidance steps. Call it before implementing any behavioural change.',
				inputSchema: z.object({}).strict(),
				outputSchema: OUTPUT_SCHEMA,
			},
			async () => {
				try {
					const override = await readPolicyOverride(options.storeDir);
					const resolved = resolveTestPolicy({
						configMode: options.configMode,
						override: override?.mode,
					});
					return toolJson({
						ok: true,
						mode: resolved.mode,
						source: resolved.source,
						guidance: [...POLICY_GUIDANCE[resolved.mode]],
						...(options.extraGuidance !== undefined
							? { extraGuidance: options.extraGuidance }
							: {}),
						...(override?.reason !== undefined
							? { overrideReason: override.reason }
							: {}),
						...(override !== null
							? { overrideSetAt: override.setAt }
							: {}),
					});
				} catch (error) {
					return toolError(
						error instanceof Error ? error.message : String(error),
						'Check that the plugin cache dir is readable.',
					);
				}
			},
		);
	},
});
