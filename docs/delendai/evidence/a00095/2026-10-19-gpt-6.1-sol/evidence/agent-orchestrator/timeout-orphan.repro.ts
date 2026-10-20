import { resolve } from 'node:path';

const sourceRoot = resolve(process.env.AUDIT_SOURCE_ROOT ?? process.cwd());
const { LinearDispatcher } = await import(
	`${sourceRoot}/plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
);

const plan = {
	mode: 'linear',
	rationale: 'isolated audit reproduction',
	steps: [
		{
			order: 1,
			kind: 'spawn',
			instruction: 'write fixture',
			subagentRole: 'implementer',
		},
	],
	budget: {
		maxTokensOrchestrator: 0,
		maxTokensPerSubagent: 0,
		timeoutMs: 5,
	},
	rotation: { maxIterationsPerSubagent: 2, allow: ['error-storm'] },
} as const;

let active = 0;
let peakConcurrent = 0;
let spawned = 0;
let completed = 0;
const port = {
	spawnSubagent: async () => {
		spawned += 1;
		const id = spawned;
		active += 1;
		peakConcurrent = Math.max(peakConcurrent, active);
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
		completed += 1;
		active -= 1;
		return {
			subagentId: `s${id}`,
			tokensUsed: 0,
			output: 'done',
			schemaOk: true,
			hadError: false,
		};
	},
};

const outcome = await new LinearDispatcher(plan, port, 'audit-timeout').run();
console.log(
	JSON.stringify({
		ok: outcome.ok,
		spawned,
		activeAtReturn: active,
		peakConcurrent,
		completedAtReturn: completed,
		rotations: outcome.steps[0]?.rotations.map((row) => row.reason),
	}),
);
await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
console.log(
	JSON.stringify({
		afterSettling: { spawned, active, peakConcurrent, completed },
	}),
);
