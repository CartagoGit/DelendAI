import type { IRehearsalScenario } from '../interfaces/rehearsal.interface';

/**
 * The scenarios a run can play. Empty until the scenario slice fills it:
 * the harness runs whatever it is given, and a run with none reports that.
 */
export const REHEARSAL_CATALOGUE: readonly IRehearsalScenario[] = [];
