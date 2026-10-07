import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

import type { IUsageSummary } from './types';

/** Best-effort read of the persisted summary (missing/corrupt → null). */
export const readSummaryFile = async (
	summaryPath: string,
): Promise<IUsageSummary | null> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(summaryPath)).readText(
				basename(summaryPath),
			)
		).content;
		return JSON.parse(raw) as IUsageSummary;
	} catch {
		return null;
	}
};
