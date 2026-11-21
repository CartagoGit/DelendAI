/**
 * run-with-escalation.ts — the pure orchestrator for one gated run.
 *
 * SRP: run the ladder's first rung and check the project's acceptance gate.
 * A worker that needs more capacity returns a blocker; nothing escalates
 * automatically — a stronger rung runs only when the owner decides so and
 * calls again with the ladder from that rung. Pure over injected seams
 * (DIP): `runProvider` executes a provider (in production, orchestrator-
 * runner's `invoke`) and `checkAcceptance` is the project's gate. A rung
 * that THROWS counts as a failure. The model actually used (when the seam
 * reports it) is recorded and a mismatch with the requested one is
 * reported. Never throws itself.
 */
import { modelMismatch } from '../routing/task-class-tier.service';
import type {
	IEscalationOutcome,
	IEscalationPlan,
	IRunEscalationDeps,
} from '../contracts/interfaces/escalation.interface';

type TRunDeps = IRunEscalationDeps & {
	/** The model the provider actually used for this output, when known. */
	readonly modelUsed?: (output: unknown) => string | undefined;
};

type TRunOutcome = IEscalationOutcome & {
	/** Why the run stopped without a pass; the owner decides what is next. */
	readonly blocker?: string;
	/** Models used per attempt, with any mismatch against the requested. */
	readonly models: ReadonlyArray<{
		readonly id: string;
		readonly used?: string;
		readonly mismatch?: string;
	}>;
};

/**
 * Run the ladder's head and check the gate. A pass returns it; a failure
 * returns a blocker naming the rung that failed, with the per-attempt trace.
 */
export const runWithEscalation = async (
	plan: IEscalationPlan,
	task: string,
	deps: TRunDeps,
): Promise<TRunOutcome> => {
	const rung = plan.ladder[0];
	if (rung === undefined) {
		return {
			ok: false,
			chosen: null,
			attempts: [],
			models: [],
			blocker: 'no provider is reachable within the cost ceiling',
		};
	}
	let passed = false;
	let used: string | undefined;
	try {
		const output = await deps.runProvider(rung.candidate, task);
		used = deps.modelUsed?.(output);
		passed = await deps.checkAcceptance(output, rung.candidate);
	} catch {
		passed = false;
	}
	const mismatch = modelMismatch(rung.candidate.models, used);
	const attempts = [{ candidate: rung.candidate, passed }];
	const models = [
		{
			id: rung.candidate.id,
			...(used === undefined ? {} : { used }),
			...(mismatch === undefined ? {} : { mismatch }),
		},
	];
	if (passed) {
		return { ok: true, chosen: rung.candidate, attempts, models };
	}
	return {
		ok: false,
		chosen: null,
		attempts,
		models,
		blocker: `${rung.candidate.id} did not pass the acceptance gate and needs more capacity; a stronger tier needs the owner's decision`,
	};
};
