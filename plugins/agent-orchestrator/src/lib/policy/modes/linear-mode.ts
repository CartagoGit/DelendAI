/**
 * `linear` mode — one subagent at a time, sequential.
 *
 * Status: S2 stub. The interface is locked so S1 can compile + test the
 * registry; the actual dispatch + budget enforcement lands in S2. The
 * stub still validates planner invariants (steps are ordered, deps
 * reference earlier orders, subagent roles are recognised).
 */
import type {
	IModeAdapter,
	IModePlan,
	IOrchestratorPolicy,
	IPlanStep,
	ITask,
} from '../types.js';

const KNOWN_ROLES: ReadonlySet<string> = new Set([
	'scout',
	'implementer',
	'verifier',
	'reviewer',
	'scribe',
]);

export class LinearModeAdapter implements IModeAdapter {
	readonly id = 'linear' as const;

	accepts(task: ITask, _policy: IOrchestratorPolicy): boolean {
		// Linear accepts everything single rejects but won't take huge
		// multi-tenant enjambres — those go to `swarm`. S2 refines this.
		if (task.hint === 'large') return false;
		if (task.tags.some((t) => t.toLowerCase() === 'swarm')) return false;
		return true;
	}

	plan(task: ITask, policy: IOrchestratorPolicy): IModePlan {
		const steps: IPlanStep[] = [
			{
				order: 1,
				kind: 'spawn',
				subagentRole: 'scout',
				instruction: `Scope: ${task.description}`,
			},
			{
				order: 2,
				kind: 'spawn',
				subagentRole: 'implementer',
				instruction: 'Apply the change guided by the scout.',
				dependsOn: [1],
			},
			{
				order: 3,
				kind: 'verify',
				instruction: 'Verify the change against the task description.',
				dependsOn: [2],
			},
		];

		assertStepsValid(steps);
		return {
			mode: this.id,
			rationale:
				'Task is too rich for a single context but not large enough for a parallel swarm.',
			steps,
			budget: { ...policy.defaults.budget },
			rotation: policy.defaults.rotation,
		};
	}
}

export function assertStepsValid(steps: readonly IPlanStep[]): void {
	let lastOrder = 0;
	for (const step of steps) {
		if (step.order <= lastOrder) {
			throw new Error(
				`Plan steps must be strictly increasing; got ${step.order} after ${lastOrder}`,
			);
		}
		lastOrder = step.order;
		if (step.kind === 'spawn' && step.subagentRole) {
			if (!KNOWN_ROLES.has(step.subagentRole)) {
				throw new Error(`Unknown subagent role: ${step.subagentRole}`);
			}
		}
		for (const dep of step.dependsOn ?? []) {
			if (dep >= step.order) {
				throw new Error(
					`Step ${step.order} depends on ${dep} which is not strictly earlier`,
				);
			}
		}
	}
}
