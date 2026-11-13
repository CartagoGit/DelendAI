import { DEFAULT_DEFERRAL_POLICY } from '../contracts/constants/read-model.constant';
import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import type { IRoadmapGateEvidence } from '../contracts/interfaces/gate.interface';
import type {
	IRoadmapBlocker,
	IRoadmapHorizonReadiness,
	IRoadmapPromotionPolicy,
} from '../contracts/interfaces/read-model.interface';
import type {
	IRoadmapEntry,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';
import { evaluateEntryGates } from '../gates/gate-evaluator.service';

const isPromised = (entry: IRoadmapEntry): boolean =>
	!(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(entry.state);

/** The entry's verdict over the gate kinds the project lets hold a promotion. */
const blockingVerdict = (
	entry: IRoadmapEntry,
	evidence: IRoadmapGateEvidence,
	policy: IRoadmapPromotionPolicy,
): IRoadmapBlocker['gates'] | undefined => {
	const kinds = policy.blockingGates;
	const gates =
		kinds === undefined
			? entry.gates
			: entry.gates.filter((gate) => kinds.includes(gate.kind));
	// Declared gates, none of a blocking kind: nothing here holds it.
	if (gates.length === 0 && entry.gates.length > 0) return undefined;
	return evaluateEntryGates({ ...entry, gates }, evidence);
};

/**
 * Whether a horizon can be promoted, from the evidence at hand. A failed
 * blocking gate, or an entry still open under the `block` policy, makes
 * it not ready. With no failure, a gate nobody could look up makes it
 * unknown — never ready, and never a failure either.
 */
export const horizonReadiness = (
	horizon: IRoadmapHorizon,
	evidence: IRoadmapGateEvidence,
	policy: IRoadmapPromotionPolicy = {},
): IRoadmapHorizonReadiness => {
	const deferral = policy.deferralPolicy ?? DEFAULT_DEFERRAL_POLICY;
	const blockers: IRoadmapBlocker[] = [];
	const unverified: IRoadmapBlocker[] = [];
	const toDefer: string[] = [];
	const closable: string[] = [];
	for (const entry of horizon.entries.filter(isPromised)) {
		const gates = blockingVerdict(entry, evidence, policy);
		const held = { entryId: entry.id, state: entry.state, gates };
		if (
			entry.state !== 'delivered' &&
			evaluateEntryGates(entry, evidence).status === 'pass'
		)
			closable.push(entry.id);
		if (gates?.status === 'fail') {
			blockers.push({ ...held, gates });
			continue;
		}
		if (entry.state !== 'delivered') {
			if (deferral === 'report') {
				toDefer.push(entry.id);
				continue;
			}
			blockers.push({
				...held,
				gates: gates ?? {
					status: 'unknown',
					reason: `entry ${entry.id} declares no blocking gate`,
				},
			});
			continue;
		}
		if (gates?.status === 'unknown') unverified.push({ ...held, gates });
	}
	const base = {
		version: horizon.version,
		blockers,
		unverified,
		toDefer,
		closable,
	};
	const close =
		closable.length === 0
			? ''
			: `; every gate of ${closable.join(', ')} passes: close ${closable.length === 1 ? 'it' : 'them'} with roadmap_plan_close`;
	if (blockers.length > 0) {
		return {
			...base,
			status: 'not-ready',
			reason: `${String(blockers.length)} promised entr${blockers.length === 1 ? 'y holds' : 'ies hold'} ${horizon.version} back: ${blockers.map((each) => each.entryId).join(', ')}${close}`,
		};
	}
	if (unverified.length > 0) {
		return {
			...base,
			status: 'unknown',
			reason: `nothing failed, and ${String(unverified.length)} delivered entr${unverified.length === 1 ? 'y has' : 'ies have'} gates without evidence: ${unverified.map((each) => each.entryId).join(', ')}`,
		};
	}
	return {
		...base,
		status: 'ready',
		reason:
			toDefer.length === 0
				? `every promised entry of ${horizon.version} is delivered and its blocking gates pass`
				: `what is delivered passes; ${String(toDefer.length)} open entr${toDefer.length === 1 ? 'y is' : 'ies are'} left to record as deferred: ${toDefer.join(', ')}${close}`,
	};
};
