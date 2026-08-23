import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import type {
	IReportRecord,
	IReportRecordInput,
	IReportStore,
} from './contracts/interfaces/report-store.interface';

type IStateFile = Record<string, IReportRecord>;

const readAll = async (statePath: string): Promise<IStateFile> => {
	try {
		const raw = await readFile(statePath, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null
			? (parsed as IStateFile)
			: {};
	} catch {
		return {};
	}
};

export const createReportStore = (dirAbs: string): IReportStore => {
	const statePath = join(dirAbs, 'reported.json');
	return {
		statePath,
		async get(signature) {
			return (await readAll(statePath))[signature];
		},
		async all() {
			return Object.values(await readAll(statePath));
		},
		async record(signature, input) {
			await withFileMutex(statePath, async () => {
				const state = await readAll(statePath);
				const previous = state[signature];
				const issueNumber = input.issueNumber ?? previous?.issueNumber;
				const issueUrl = input.issueUrl ?? previous?.issueUrl;
				const next: IReportRecord = {
					signature,
					count: (previous?.count ?? 0) + 1,
					lastReportedAt: input.at,
					...(issueNumber !== undefined ? { issueNumber } : {}),
					...(issueUrl !== undefined ? { issueUrl } : {}),
				};
				state[signature] = next;
				await writeFileAtomic(
					statePath,
					JSON.stringify(state, null, '\t'),
				);
			});
		},
	};
};
