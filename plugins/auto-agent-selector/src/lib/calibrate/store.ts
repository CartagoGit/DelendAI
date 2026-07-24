/**
 * store.ts — the production calibration store: an append-only JSONL log under
 * the plugin's results cache. The only module here that touches the OS;
 * `computeWinRates` stays pure over what `readAll` returns. Never throws
 * (a missing/corrupt log reads as an empty history).
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ICalibrationStore,
	IOutcomeRecord,
} from '../contracts/interfaces/calibration.interface';

const isRecord = (value: unknown): value is IOutcomeRecord =>
	value !== null &&
	typeof value === 'object' &&
	typeof (value as IOutcomeRecord).providerId === 'string' &&
	typeof (value as IOutcomeRecord).success === 'boolean';

/** Build a calibration store rooted at `dirAbs` (its `calibration.jsonl`). */
export const realCalibrationStore = (dirAbs: string): ICalibrationStore => {
	const file = join(dirAbs, 'calibration.jsonl');
	return {
		append: async (record) => {
			await mkdir(dirAbs, { recursive: true });
			const line = JSON.stringify({
				...record,
				ts: record.ts ?? new Date().toISOString(),
			});
			await appendFile(file, `${line}\n`, 'utf8');
		},
		readAll: async () => {
			let raw: string;
			try {
				raw = await readFile(file, 'utf8');
			} catch {
				return [];
			}
			const out: IOutcomeRecord[] = [];
			for (const line of raw.split('\n')) {
				if (line.trim().length === 0) continue;
				try {
					const parsed: unknown = JSON.parse(line);
					if (isRecord(parsed)) out.push(parsed);
				} catch {
					// skip a corrupt line, keep the rest
				}
			}
			return out;
		},
	};
};
