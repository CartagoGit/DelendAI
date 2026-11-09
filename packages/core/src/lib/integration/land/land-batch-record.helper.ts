/**
 * land-batch-record.helper.ts — what a batch pull request keeps on the
 * forge for the next pass: its body (members, verdict, a machine record),
 * its branch name, and what the red ones already settled.
 */
import {
	LAND_BATCH_BRANCH,
	LAND_RECORD_CLOSE,
	LAND_RECORD_OPEN,
} from './land.constant';
import type { ILandBatchRecord } from './land.interface';

const RECORD = new RegExp(
	`${LAND_RECORD_OPEN} (\\{.*\\}) ${LAND_RECORD_CLOSE}`,
	'u',
);

/** The record a batch body carries, or `undefined` when it has none. */
export const readBatchRecord = (body: string): ILandBatchRecord | undefined => {
	const raw = RECORD.exec(body)?.[1];
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as ILandBatchRecord;
	} catch {
		return undefined;
	}
};

/** A batch body in the product's PR format: what it is, its members, the record. */
export const batchBody = (
	record: ILandBatchRecord,
	titles: ReadonlyMap<number, string>,
): string =>
	[
		'## What',
		'',
		`One batch over \`${record.tip.slice(0, 12)}\`: the ready pull requests below overlap, so they are tested together once.`,
		'',
		'## Members',
		'',
		...record.members.map((member) =>
			`- #${String(member.number)} ${titles.get(member.number) ?? ''} (\`${member.sha.slice(0, 12)}\`)`.trimEnd(),
		),
		'',
		...(record.red === undefined
			? []
			: [
					'## Verdict',
					'',
					record.red.culprit === undefined
						? `Red with no single owner; suspects: ${record.red.suspects.map((n) => `#${String(n)}`).join(', ')}.`
						: `Red; the culprit is #${String(record.red.culprit)}.`,
					'',
				]),
		'Opened and landed by `land`; do not push to this branch.',
		`${LAND_RECORD_OPEN} ${JSON.stringify(record)} ${LAND_RECORD_CLOSE}`,
	].join('\n');

export const refOf = (prefix: string, members: readonly number[]): string =>
	`${prefix}${LAND_BATCH_BRANCH}${members.join('+')}`;

export const setKey = (members: readonly number[]): string =>
	[...members].sort((a, b) => a - b).join(',');

/** What red batches on the forge say: culprit heads, red sets on this tip, suspects to test alone. */
export class BatchMemory {
	readonly culpritHeads = new Map<number, string>();
	readonly redSets = new Set<string>();
	readonly aloneOnTip = new Set<number>();
	constructor(private readonly tip: string) {}

	remember(record: ILandBatchRecord): void {
		if (record.red === undefined) return;
		const { culprit } = record.red;
		if (culprit !== undefined) {
			const head = record.members.find((m) => m.number === culprit);
			if (head !== undefined) this.culpritHeads.set(culprit, head.sha);
		}
		if (record.tip !== this.tip) return;
		this.redSets.add(setKey(record.members.map((m) => m.number)));
		if (culprit === undefined) {
			for (const n of record.red.suspects) this.aloneOnTip.add(n);
		}
	}
}
