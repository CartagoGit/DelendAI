import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

/**
 * Durable de-duplication state. One JSON document maps
 * `signature -> IReportRecord` so the same bug does not open a new
 * issue on every sighting — it is recorded once per window and future
 * sightings are suppressed until the window expires.
 */
export interface IReportRecord {
	readonly signature: string;
	/** GitHub issue number, present only when an issue was actually created. */
	readonly issueNumber?: number;
	/** Resolved issue URL, present only when an issue was created. */
	readonly issueUrl?: string;
	/** ISO timestamp of the last (attempted) report. */
	readonly lastReportedAt: string;
	/** Total sightings recorded for this signature. */
	readonly count: number;
}

export interface IReportRecordInput {
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
	readonly at: string;
}

export interface IReportStore {
	readonly statePath: string;
	get(signature: string): Promise<IReportRecord | undefined>;
	record(signature: string, input: IReportRecordInput): Promise<void>;
	all(): Promise<readonly IReportRecord[]>;
}

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
