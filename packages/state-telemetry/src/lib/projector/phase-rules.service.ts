import { DEFAULT_PHASE_RULES } from './contracts/constants/phase-rules.constant';
import type { IPhaseRule } from './contracts/interfaces/work-progress.interface';

/**
 * The effective rule table: caller rules first (so they can override a
 * default for the same kind), then the defaults.
 */
export const resolvePhaseRules = (
	extra: readonly IPhaseRule[] = [],
): readonly IPhaseRule[] => [...extra, ...DEFAULT_PHASE_RULES];
