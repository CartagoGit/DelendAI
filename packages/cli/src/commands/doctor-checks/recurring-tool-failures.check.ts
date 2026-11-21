import { join } from 'node:path';

import {
	RECURRING_FAILURE_THRESHOLD,
	RECURRING_FAILURE_WINDOW_DAYS,
} from '../../contracts/constants/recurring-tool-failures.constant';
import type { IDoctorSection } from '../../lib/doctor/types';
import { summariseToolFailures } from '../kpis-renderer';
import type { IDoctorCommandCheck } from '../doctor';

const DAY_MS = 86_400_000;
const EVENTS_RELATIVE_PATH = join(
	'.cache',
	'delendai',
	'runtime',
	'events.jsonl',
);
const REPORTED_CLASSES: ReadonlySet<string> = new Set([
	'refused',
	'threw',
	'input-invalid',
]);

export const checkRecurringToolFailures: IDoctorCommandCheck = async (
	ctx,
): Promise<IDoctorSection> => {
	const text = (await ctx.fs.readFile(EVENTS_RELATIVE_PATH)) ?? '';
	const sinceMs =
		ctx.now().getTime() - RECURRING_FAILURE_WINDOW_DAYS * DAY_MS;
	const findings: string[] = [];
	for (const row of summariseToolFailures(text, sinceMs)) {
		for (const code of row.topCodes) {
			if (
				REPORTED_CLASSES.has(code.class) &&
				code.count >= RECURRING_FAILURE_THRESHOLD
			) {
				findings.push(
					`${row.tool} failed ${code.count} times in ${RECURRING_FAILURE_WINDOW_DAYS} days with ${code.class}: ${code.code}`,
				);
			}
		}
	}
	return findings.length === 0
		? {
				name: 'recurring-tool-failures',
				status: 'ok',
				findings: ['no tool failure code recurs above the threshold'],
			}
		: { name: 'recurring-tool-failures', status: 'warn', findings };
};
