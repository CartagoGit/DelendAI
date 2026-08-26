/**
 * `swarm` mode — fan-out parallel subagents.
 *
 * Status: S3 stub. Locks the adapter surface; the actual parallel
 * dispatch + dedupe lands in S3.
 */
import type {
	IModeAdapter,
	IModePlan,
	IOrchestratorPolicy,
	IPlanStep,
	ITask,
} from '../types.js';

import { assertStepsValid } from './linear-mode.js';

export class SwarmModeAdapter implements IModeAdapter {
	readonly id = 'swarm' as const;

	accepts(task: ITask, _policy: IOrchestratorPolicy): boolean {
		return task.hint === 'large' || task.tags.includes('swarm');
	}

	plan(task: ITask, policy: IOrchestratorPolicy): IModePlan {
		const steps: IPlanStep[] = [
			{
				order: 1,
				kind: 'spawn',
				subagentRole: 'scout',
				instruction: `Decompose: ${task.description}`,
			},
			{
				order: 2,
				kind: 'spawn',
				subagentRole: 'implementer',
				instruction: 'Parallel implementation slice A',
				dependsOn: [1],
			},
			{
				order: 3,
				kind: 'spawn',
				subagentRole: 'implementer',
				instruction: 'Parallel implementation slice B',
				dependsOn: [1],
			},
			{
				order: 4,
				kind: 'join',
				instruction: 'Reconcile A and B into a single coherent change.',
				dependsOn: [2, 3],
			},
			{
				order: 5,
				kind: 'verify',
				instruction: 'Verify the merged change end-to-end.',
				dependsOn: [4],
			},
		];

		assertStepsValid(steps);
		return {
			mode: this.id,
			rationale: 'Large task → enjambre for parallel coverage.',
			steps,
			budget: { ...policy.defaults.budget },
			rotation: policy.defaults.rotation,
		};
	}
}
