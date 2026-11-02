/**
 * run-with-escalation.ts — the pure escalation orchestrator.
 *
 * SRP: walk the ladder, running each rung and checking the project's
 * acceptance gate; stop at the first pass, otherwise escalate to the next
 * (stronger) rung. Pure over injected seams (DIP): `runProvider` executes a
 * provider (in production, orchestrator-runner's `invoke`) and
 * `checkAcceptance` is the project's gate (the validation matrix / quality
 * run). A rung that THROWS counts as a failure and escalates — a provider
 * that errors is exactly a case for a stronger one. Never throws itself.
 */
import type {
	IEscalationOutcome,
	IEscalationPlan,
	IRunEscalationDeps,
} from '../contracts/interfaces/escalation.interface';
import type { IProviderCandidate } from '../contracts/interfaces/roster.interface';

/**
 * Run the ladder head-first, escalating on a gate failure (or a thrown
 * provider) until a rung passes or the ladder is exhausted. Returns the
 * per-rung trace so the caller can show what was tried.
 */
export const runWithEscalation = async (
	plan: IEscalationPlan,
	task: string,
	deps: IRunEscalationDeps,
): Promise<IEscalationOutcome> => {
	const attempts: Array<{
		candidate: IProviderCandidate;
		passed: boolean;
	}> = [];

	for (const rung of plan.ladder) {
		let passed = false;
		try {
			const output = await deps.runProvider(rung.candidate, task);
			passed = await deps.checkAcceptance(output, rung.candidate);
		} catch {
			passed = false; // an erroring provider escalates
		}
		attempts.push({ candidate: rung.candidate, passed });
		if (passed) {
			return { ok: true, chosen: rung.candidate, attempts };
		}
	}

	return { ok: false, chosen: null, attempts };
};
