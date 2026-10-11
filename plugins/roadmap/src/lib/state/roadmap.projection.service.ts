import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import { buildBumpIntent } from '../bump/roadmap-bump-intent.service';
import type { IRoadmapGateEvidence } from '../contracts/interfaces/gate.interface';
import type {
	IRoadmapHorizonProjection,
	IRoadmapProjection,
} from '../contracts/interfaces/roadmap-producer.interface';
import type {
	IRoadmap,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';
import { evaluateEntryGates } from '../gates/gate-evaluator.service';

const isWithdrawn = (state: string): boolean =>
	(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(state);

const projectHorizon = (
	horizon: IRoadmapHorizon,
	evidence: IRoadmapGateEvidence,
): IRoadmapHorizonProjection => {
	const entries = horizon.entries.map((entry) => ({
		id: entry.id,
		kind: entry.kind,
		state: entry.state,
		gates: evaluateEntryGates(entry, evidence),
	}));
	const delivered = entries.filter((e) => e.state === 'delivered').length;
	const withdrawn = entries.filter((e) => isWithdrawn(e.state)).length;
	return {
		version: horizon.version,
		bump: buildBumpIntent(horizon),
		entries,
		counts: {
			total: entries.length,
			delivered,
			withdrawn,
			open: entries.length - delivered - withdrawn,
		},
	};
};

/**
 * What the roadmap says about itself: per horizon, the bump it implies,
 * every entry's state and gate verdict, and how many entries are open.
 * Pure: the same roadmap and evidence always give the same answer, in the
 * order the file lists them.
 */
export const projectRoadmap = (
	roadmap: IRoadmap,
	evidence: IRoadmapGateEvidence,
): IRoadmapProjection => ({
	horizons: roadmap.horizons.map((horizon) =>
		projectHorizon(horizon, evidence),
	),
});
