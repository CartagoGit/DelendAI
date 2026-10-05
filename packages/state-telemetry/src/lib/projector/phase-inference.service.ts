import { WORK_PHASE_ORDER } from './contracts/constants/work-progress.constant';
import type {
	IPhaseRule,
	TWorkPhase,
} from './contracts/interfaces/work-progress.interface';
import type { TWorkEventKind } from '../events/work-event';

/** Position of a phase in the forward order; `blocked` has none. */
export const phaseRank = (phase: TWorkPhase): number =>
	(WORK_PHASE_ORDER as readonly string[]).indexOf(phase);

export const phaseAtRank = (rank: number): TWorkPhase =>
	WORK_PHASE_ORDER[
		Math.min(Math.max(rank, 0), WORK_PHASE_ORDER.length - 1)
	] as TWorkPhase;

/** The phase one event implies, or `undefined` when no rule matches (ambiguous). */
export const inferPhase = (
	rules: readonly IPhaseRule[],
	kind: TWorkEventKind,
	previousKind: TWorkEventKind | null,
): TWorkPhase | undefined =>
	rules.find(
		(rule) =>
			rule.kind === kind &&
			(rule.afterKind === undefined || rule.afterKind === previousKind),
	)?.phase;

/** Phase never moves backwards: the later of the two ranks wins. */
export const advanceRank = (
	current: number,
	implied: TWorkPhase | undefined,
): number =>
	implied === undefined ? current : Math.max(current, phaseRank(implied));
