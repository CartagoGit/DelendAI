import type { Database } from 'bun:sqlite';

import { SummaryRepo } from '../repository/summary-repo';

export interface ISummaryBackfillProposal {
	readonly uid: string;
	readonly kind: string;
	readonly title: string;
	readonly contentHash: string;
}

export interface ISummaryBackfillArgs {
	readonly kind?: string;
	readonly uid?: string;
	readonly summaryModel: string;
	readonly summaryPromptVersion: string;
	readonly now?: number;
	readonly summarize: (
		proposal: ISummaryBackfillProposal,
	) => string | Promise<string>;
}

export interface ISummaryBackfillResult {
	readonly considered: number;
	readonly created: number;
	readonly skipped: number;
}

export const summaryBackfill = async (
	db: Database,
	args: ISummaryBackfillArgs,
): Promise<ISummaryBackfillResult> => {
	const conditions = [
		'p.content_hash IS NOT NULL',
		's.content_hash IS NULL',
	];
	const bindings: string[] = [];
	if (args.kind !== undefined) {
		conditions.push('p.kind = ?');
		bindings.push(args.kind);
	}
	if (args.uid !== undefined) {
		conditions.push('p.uid = ?');
		bindings.push(args.uid);
	}
	const rows = db
		.query<ISummaryBackfillProposal, string[]>(
			`SELECT p.uid, p.kind, p.title, p.content_hash AS contentHash
			 FROM proposals p
			 LEFT JOIN summary_cache s ON s.content_hash = p.content_hash
			 WHERE ${conditions.join(' AND ')}
			 ORDER BY p.updated_at DESC`,
		)
		.all(...bindings);
	const repo = new SummaryRepo(db);
	let created = 0;
	for (const proposal of rows) {
		const summary = (await args.summarize(proposal)).trim();
		if (summary === '') throw new Error(`empty summary for ${proposal.uid}`);
		if (
			repo.insertIfAbsent({
				contentHash: proposal.contentHash,
				summary,
				summaryModel: args.summaryModel,
				summaryPromptVersion: args.summaryPromptVersion,
				createdAt: args.now ?? Date.now(),
			})
		) {
			created += 1;
		}
	}
	return {
		considered: rows.length,
		created,
		skipped: rows.length - created,
	};
};