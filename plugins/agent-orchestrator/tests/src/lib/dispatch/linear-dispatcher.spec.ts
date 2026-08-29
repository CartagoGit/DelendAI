import { describe, it, expect } from 'vitest';

import { FakeDispatchPort } from '../../../../src/lib/dispatch/fake-port.js';
import type { IFakeScriptStep } from '../../../../src/lib/dispatch/fake-port.js';
import { LinearDispatcher } from '../../../../src/lib/dispatch/linear-dispatcher.js';
import type {
	IModePlan,
	IOrchestratorPolicy,
	IPlanStep,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'linear',
	defaults: {
		budget: {
			maxTokensOrchestrator: 0,
			maxTokensPerSubagent: 0,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 5,
			allow: ['repeated-output', 'error-storm', 'token-budget-exhausted'],
		},
	},
};

const PLAN_STEPS: IPlanStep[] = [
	{
		order: 1,
		kind: 'spawn',
		subagentRole: 'scout',
		instruction: 'Scope: x',
	},
	{
		order: 2,
		kind: 'spawn',
		subagentRole: 'implementer',
		instruction: 'Apply the change',
		dependsOn: [1],
	},
	{
		order: 3,
		kind: 'verify',
		instruction: 'Verify',
		dependsOn: [2],
	},
];

const PLAN: IModePlan = {
	mode: 'linear',
	rationale: 'test plan',
	steps: PLAN_STEPS,
	budget: POLICY.defaults.budget,
	rotation: POLICY.defaults.rotation,
};

function badOutput(s: string): IFakeScriptStep {
	return { output: s, tokensUsed: 5, schemaOk: true, hadError: false };
}

describe('LinearDispatcher', () => {
	it('runs a clean 3-step plan to completion (warmup + confirmation per step)', async () => {
		// The dispatcher requires 3 ingestions per step before accepting:
		// iter 1 = warmup, iter 2 = baseline, iter 3 = the candidate.
		// The A,B,A detector rule fires only when last 3 are A,B,A, not
		// A,A,A — so a stable "ok, ok, ok" run accepts cleanly.
		const port = new FakeDispatchPort();
		const out = await new LinearDispatcher(PLAN, port, 't1').run();
		expect(out.ok).toBe(true);
		expect(out.steps).toHaveLength(3);
		expect(out.steps[0]?.ok).toBe(true);
		expect(out.steps[0]?.subagentIds).toHaveLength(3);
		expect(out.steps[1]?.ok).toBe(true);
		expect(out.steps[1]?.subagentIds).toHaveLength(3);
		expect(out.steps[2]?.ok).toBe(true);
		expect(out.steps[2]?.subagentIds).toHaveLength(0); // verify is orchestrator-only
	});

	it('rotates a subagent when the loop reverts to a previous value (A,B,A)', async () => {
		// A,B,A pattern (last 3): "x" → "y" → "x" ⇒ `repeated-output` ⇒ rotate.
		// Then iter 4 emits "z" (different from "x" and "y") ⇒ clean (no A,B,A in last 3).
		const port = new FakeDispatchPort({
			script: new Map<string, readonly IFakeScriptStep[]>([
				[
					'slot-1-scout',
					[
						badOutput('x'),
						badOutput('y'),
						badOutput('x'),
						badOutput('z'),
					],
				],
			]),
		});
		const out = await new LinearDispatcher(PLAN, port, 't1').run();
		expect(out.steps[0]?.ok).toBe(true);
		expect(out.steps[0]?.subagentIds).toHaveLength(4);
		expect(out.steps[0]?.rotations).toHaveLength(1);
		expect(out.steps[0]?.rotations[0]?.reason).toBe('repeated-output');
	});

	it('fails a step when rotation triggers fire out', async () => {
		// Repeated A,B,A,B,A pattern: each rotation produces a new A.
		// iter 1: x (warmup).
		// iter 2: y. iter 3: x → A,B,A detected ⇒ rotate.
		// iter 4: y. iter 5: x → A,B,A again ⇒ rotate, but iter === maxIter ⇒ fail.
		const port = new FakeDispatchPort({
			script: new Map<string, readonly IFakeScriptStep[]>([
				[
					'slot-1-scout',
					[
						badOutput('x'),
						badOutput('y'),
						badOutput('x'),
						badOutput('y'),
						badOutput('x'),
					],
				],
			]),
		});
		const out = await new LinearDispatcher(PLAN, port, 't1').run();
		expect(out.steps[0]?.ok).toBe(false);
		expect(out.steps[0]?.subagentIds).toHaveLength(5);
		// 3 rotations: iters 3, 4, 5 each detect A,B,A. iter 5 === maxIter ⇒ fail.
		expect(out.steps[0]?.rotations).toHaveLength(3);
		// Subsequent steps depending on #1 are skipped.
		expect(out.steps[1]?.ok).toBe(false);
		expect(out.steps[1]?.subagentIds).toHaveLength(0);
		// verify has no deps ⇒ runs anyway.
		expect(out.steps[2]?.ok).toBe(true);
	});

	it('fails closed when the trigger is not in the allow list', async () => {
		const tight: IModePlan = {
			...PLAN,
			rotation: {
				maxIterationsPerSubagent: 5,
				allow: ['error-storm'],
			},
		};
		const port = new FakeDispatchPort({
			script: new Map<string, readonly IFakeScriptStep[]>([
				[
					'slot-1-scout',
					[badOutput('x'), badOutput('y'), badOutput('x')],
				],
			]),
		});
		const out = await new LinearDispatcher(tight, port, 't1').run();
		expect(out.steps[0]?.ok).toBe(false);
		expect(out.steps[0]?.subagentIds).toHaveLength(3);
		expect(out.steps[0]?.rotations[0]?.reason).toMatch(
			/forbidden: repeated-output/,
		);
	});

	it('captures host throws as error-storm rotations', async () => {
		// 3 consecutive throws ⇒ error-storm fires (3 of last 5 errored).
		// Plan maxIter=5, so 5 subagents get spawned; 3+ throws each
		// register an error-storm rotation; step fails.
		const port = new FakeDispatchPort({
			script: new Map<string, readonly IFakeScriptStep[]>([
				[
					'slot-1-scout',
					[
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-1',
						},
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-2',
						},
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-3',
						},
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-4',
						},
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-5',
						},
					],
				],
			]),
		});
		const out = await new LinearDispatcher(PLAN, port, 't1').run();
		expect(out.steps[0]?.ok).toBe(false);
		expect(out.steps[0]?.subagentIds).toHaveLength(5);
		expect(out.steps[0]?.rotations.length).toBeGreaterThanOrEqual(1);
	});

	it('bails out when orchestrator budget is exhausted', async () => {
		const tight: IModePlan = {
			...PLAN,
			budget: {
				maxTokensOrchestrator: 100,
				maxTokensPerSubagent: 0,
				timeoutMs: 0,
			},
		};
		const port = new FakeDispatchPort();
		const dispatcher = new LinearDispatcher(tight, port, 't1');
		// Pre-charge the orchestrator past the cap.
		dispatcher.budget().recordOrchestrator(101);
		const out = await dispatcher.run();
		expect(out.ok).toBe(false);
		expect(out.steps[0]?.ok).toBe(false);
	});
});
