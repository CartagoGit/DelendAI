import { readFile } from 'node:fs/promises';

import type { IUsageSummary } from './types';

/** Best-effort read of the persisted summary (missing/corrupt → null). */
export const readSummaryFile = async (
	summaryPath: string,
): Promise<IUsageSummary | null> => {
	try {
		const raw = await readFile(summaryPath, 'utf8');
		return JSON.parse(raw) as IUsageSummary;
	} catch {
		return null;
	}
};
