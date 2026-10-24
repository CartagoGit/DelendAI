import { describe, expect, it } from 'vitest';

import { createOrchestratorEngine } from '../../../../src/lib/policy/policy.js';
import type { IOrchestratorPolicy } from '../../../../src/lib/policy/types.js';
import { buildExecutionPolicyToolRegistration } from '../../../../src/lib/tools/execution-policy.tool.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'auto',
	defaults: {
		budget: {
			maxTokensOrchestrator: 100_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 3, allow: ['error-storm'] },
	},
};

describe('execution_policy tool', () => {
	it('returns the canonical decision and runnable mode from it', async () => {
		const engine = createOrchestratorEngine(POLICY);
		const registration = buildExecutionPolicyToolRegistration({
			namespacePrefix: 'ns',
			engine: () => engine,
		});
		let handler:
			| ((
					args: unknown,
			  ) => Promise<{ structuredContent?: Record<string, unknown> }>)
			| undefined;
		await registration.register({
			registerTool: (
				_name: string,
				_def: unknown,
				fn: typeof handler,
			) => {
				handler = fn;
			},
		} as never);

		const result = await handler!({
			id: 't1',
			description: 'Audit the repo.',
			tags: ['audit'],
		});
		const body = result.structuredContent as {
			decision: {
				ceremony: string;
				execution: string;
				reasons: Array<{ code: string }>;
			};
			resolution: { mode: string; reason: string };
		};

		expect(body.decision.ceremony).toBe('proposal');
		expect(body.decision.execution).toBe('swarm');
		expect(body.resolution.mode).toBe('swarm');
		expect(body.decision.reasons.map((reason) => reason.code)).toContain(
			'legacy-swarm-routing',
		);
	});
});
