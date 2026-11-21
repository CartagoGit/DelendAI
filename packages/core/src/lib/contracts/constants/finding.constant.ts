/**
 * finding.constant.ts — r00012 S2: canonical severity ordering for the
 * shared finding shape (most severe first). Kept as data so ranking,
 * summarising and rendering all agree on one order.
 */
import type { FindingSeverity } from '../interfaces/finding.interface';

/** Severity bands, most urgent first. Drives sorting + summary order. */
export const FINDING_SEVERITY_ORDER: readonly FindingSeverity[] = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
];
