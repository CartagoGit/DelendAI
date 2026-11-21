import type { Database } from 'bun:sqlite';

export interface ICompileRunRecord {
	readonly rowsConsidered: number;
	readonly rowsEmitted: number;
	readonly tokensInput: number;
	readonly tokensOutput: number;
	readonly cacheHits: number;
	readonly durationMs: number;
	readonly createdAt: number;
}

export class CompileRunsRepo {
	constructor(private readonly db: Database) {}

	append(record: ICompileRunRecord): void {
		this.db
			.prepare(
				`INSERT INTO compile_runs (
					rows_considered, rows_emitted, tokens_input,
					tokens_output, cache_hits, duration_ms, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				record.rowsConsidered,
				record.rowsEmitted,
				record.tokensInput,
				record.tokensOutput,
				record.cacheHits,
				record.durationMs,
				record.createdAt,
			);
	}
}
