import type { IRehearsalScenario } from '../interfaces/rehearsal.interface';

import { REHEARSAL_SCENARIOS } from './rehearsal-scenarios.constant';

/** The scenarios a run can play: every case and every production failure. */
export const REHEARSAL_CATALOGUE: readonly IRehearsalScenario[] =
	REHEARSAL_SCENARIOS;
