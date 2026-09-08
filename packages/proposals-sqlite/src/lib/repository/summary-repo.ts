import type { Database } from 'bun:sqlite';

export interface ISummaryCacheRecord {
	readonly contentHash: string;
	readonly summary: string;
	readonly summaryModel: string;
	readonly summaryPromptVersion: string;
	readonly createdAt: number;
}

interface IStoredSummaryCacheRow {
	readonly content_hash: string;
	readonly summary: string;
	readonly summary_model: string;
	readonly summary_prompt_version: string;
	readonly created_at: number;
}

const mapRow = (row: IStoredSummaryCacheRow): ISummaryCacheRecord => ({
	contentHash: row.content_hash,
	summary: row.summary,
	summaryModel: row.summary_model,
	summaryPromptVersion: row.summary_prompt_version,
	createdAt: row.created_at,
});

export class SummaryRepo {
	constructor(private readonly db: Database) {}

	getByContentHash(contentHash: string): ISummaryCacheRecord | null {
		const row = this.db
			.query<IStoredSummaryCacheRow, [string]>(
				`SELECT content_hash, summary, summary_model,
						summary_prompt_version, created_at
				 FROM summary_cache WHERE content_hash = ?`,
			)
			.get(contentHash);
		return row === null ? null : mapRow(row);
	}

	insertIfAbsent(record: ISummaryCacheRecord): boolean {
		const result = this.db
			.prepare(
				`INSERT INTO summary_cache (
					content_hash, summary, summary_model,
					summary_prompt_version, created_at
				) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(content_hash) DO NOTHING`,
			)
			.run(
				record.contentHash,
				record.summary,
				record.summaryModel,
				record.summaryPromptVersion,
				record.createdAt,
			);
		return result.changes > 0;
	}
}