/**
 * validation-coordinator.service.ts — f00506 S2.
 *
 * Three agents asking for the same validation over the same state get one
 * execution and three copies of its result.
 *
 * S1 stopped the same proof being bought twice in SEQUENCE: once a run has
 * been recorded, a later request reads the evidence instead of running.
 * That does nothing for the case that actually hurts on a shared checkout,
 * which is CONCURRENCY. Three agents finish their slices within the same
 * minute, all three ask for `bun run test`, and the recorded evidence is
 * useless to them because none of the three runs has finished yet. So all
 * three run it. Each takes the compute lock in turn, and the two that lose
 * the race wait out a full run before starting their own — the wall-clock
 * cost triples for a question that had one answer.
 *
 * The fix is an in-flight map keyed by exactly the digest S1 already
 * defines. The first caller starts the run; every caller that arrives
 * while it is running attaches to the same promise. There is no polling
 * and no timeout guesswork: they are literally waiting on the one
 * execution, so they finish when it finishes.
 *
 * Two properties are worth stating because they are easy to get wrong:
 *
 * A failure propagates to everyone and is never cached as a success.
 * Sharing a run means sharing its verdict, and the verdict here is the
 * thing agents act on. S1 already refuses to reuse a recorded failure,
 * and the coordinator does not undo that: it records the failure as
 * evidence of what happened, and the next request runs again.
 *
 * The map entry is removed when the run settles, in a `finally`. A
 * coordinator that leaked entries would hand a stale promise to a caller
 * arriving after the state had moved on — the exact stale-reuse bug the
 * digest key exists to make impossible.
 */
import {
	deriveEvidenceKey,
	findReusableEvidence,
	recordEvidence,
	type IEvidenceStore,
	type IValidationEvidence,
	type IValidationEvidenceKey,
	type TValidationResult,
} from './validation-evidence.service';

export interface IValidationOutcome {
	readonly result: TValidationResult;
	readonly durationMs: number;
	/** Whatever the validator produced — output, findings, exit code. */
	readonly detail?: unknown;
}

/** How a caller got its answer. Diagnostic, and the thing worth measuring. */
export type TValidationSource =
	| 'executed'
	| 'joined-in-flight'
	| 'reused-evidence';

export interface ICoordinatedValidation {
	readonly outcome: IValidationOutcome;
	readonly source: TValidationSource;
	/** Why this source, in terms an operator can act on. */
	readonly reason: string;
}

export interface IValidationRequest {
	readonly key: IValidationEvidenceKey;
	/** The paths this run considered, kept for auditing a later reuse. */
	readonly relevantInputs: readonly string[];
	/** Runs the validator for real. Called at most once per in-flight key. */
	readonly execute: () => Promise<IValidationOutcome>;
}

export interface IValidationCoordinatorDeps {
	readonly store: IEvidenceStore;
	readonly now?: () => number;
}

export interface IValidationCoordinator {
	readonly validate: (
		request: IValidationRequest,
	) => Promise<ICoordinatedValidation>;
	/** How many executions are running right now. For tests and status. */
	readonly inFlightCount: () => number;
}

/** What the shared work produced, plus how it got there. */
interface IResolvedValidation {
	readonly outcome: IValidationOutcome;
	readonly executed: boolean;
	readonly reason: string;
}

export const createValidationCoordinator = (
	deps: IValidationCoordinatorDeps,
): IValidationCoordinator => {
	const now = deps.now ?? (() => Date.now());
	const inFlight = new Map<string, Promise<IResolvedValidation>>();

	const runAndRecord = async (
		request: IValidationRequest,
	): Promise<IValidationOutcome> => {
		const outcome = await request.execute();
		const evidence: IValidationEvidence = {
			key: request.key,
			result: outcome.result,
			recordedAt: now(),
			durationMs: outcome.durationMs,
			relevantInputs: [...request.relevantInputs],
		};
		// Recorded whatever the verdict: a failure is not reusable, but it
		// IS what happened, and an operator asking why a slice was blocked
		// needs to find it.
		await recordEvidence(evidence, deps.store);
		return outcome;
	};

	/**
	 * Look for reusable evidence, and run the validator when there is
	 * none. This whole thing is what gets shared, evidence lookup
	 * included — the lookup is itself an await, so leaving it outside
	 * would reopen the race it exists to close.
	 */
	const resolve = async (
		request: IValidationRequest,
	): Promise<IResolvedValidation> => {
		const reusable = await findReusableEvidence(request.key, deps.store);
		if (reusable.reusable && reusable.evidence !== undefined) {
			return {
				outcome: {
					result: reusable.evidence.result,
					durationMs: reusable.evidence.durationMs,
				},
				executed: false,
				reason: reusable.reason,
			};
		}
		return {
			outcome: await runAndRecord(request),
			executed: true,
			reason: `no evidence and nothing in flight for this state, so the validator ran: ${reusable.reason}`,
		};
	};

	const validate = async (
		request: IValidationRequest,
	): Promise<ICoordinatedValidation> => {
		const hash = deriveEvidenceKey(request.key);

		// An execution already running for this exact state. Attaching is
		// strictly better than starting a second one: same answer, and it
		// arrives sooner because the first run has a head start.
		const running = inFlight.get(hash);
		if (running !== undefined) {
			return {
				outcome: (await running).outcome,
				source: 'joined-in-flight',
				reason: 'an identical validation was already running over this exact input, config and dependency state; joined it instead of starting a second execution',
			};
		}

		// Registered SYNCHRONOUSLY: not a single `await` may sit between
		// the miss above and this line. An await here would let three
		// callers in the same tick all miss the map and all execute —
		// which is precisely the bug this service exists to remove, and
		// it is invisible in any test that does not start the callers
		// concurrently.
		const execution = resolve(request).finally(() => {
			// Always cleared, including on failure. A leaked entry would
			// hand a stale promise to a caller arriving after the state
			// moved on, which is exactly what keying by digest prevents.
			inFlight.delete(hash);
		});
		inFlight.set(hash, execution);

		const resolved = await execution;
		return {
			outcome: resolved.outcome,
			source: resolved.executed ? 'executed' : 'reused-evidence',
			reason: resolved.reason,
		};
	};

	return { validate, inFlightCount: () => inFlight.size };
};
