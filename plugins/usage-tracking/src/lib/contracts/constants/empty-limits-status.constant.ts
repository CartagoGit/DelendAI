import type { ILimitsStatus } from '../../types';

export const EMPTY_LIMITS_STATUS: ILimitsStatus = {
	sessionSpendUsd: 0,
	sessionLimitUsd: null,
	sessionLimitPct: null,
	monthlySpendUsd: 0,
	monthlyLimitUsd: null,
	monthlyLimitPct: null,
	breached: null,
};
