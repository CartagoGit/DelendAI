import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	CompileRunsRepo,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';
import {
	compileContext,
	type IContextCompilerDependencies,
} from '../../../../src/lib/services/context-compiler';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('compileContext telemetry', () => {
	it('writes one compile_runs row per invocation and records cache hits', async () => {
		const root = mkdtempSync(join(tmpdir(), 'compile-runs-'));
		roots.push(root);
		const driver = new ProposalsSqliteDriver({
			path: resolveProposalsDbPaths(root).databasePath,
		});
		try {
			const runs = new CompileRunsRepo(driver.handle);
			const records: Array<{
				rowsConsidered: number;
				rowsEmitted: number;
				tokensInput: number;
				tokensOutput: number;
				cacheHits: number;
				durationMs: number;
			}> = [];
			const dependencies: IContextCompilerDependencies = {
				search: async () => [
					{
						uid: 'f00001',
						kind: 'feat',
						status: 'ready',
						title: 'Cached proposal',
						snippet: 'cached snippet',
						score: -2,
					},
				],
				getDocument: async () => ({
					uid: 'f00001',
					kind: 'feat',
					status: 'ready',
					title: 'Cached proposal',
					contentHash: 'hash-1',
				}),
				getSummary: async () => 'Cached summary',
				recordCompileRun: (record) => {
					records.push(record);
					runs.append({ ...record, createdAt: 100 });
				},
			};

			await compileContext({ task: 'first task', maxTokens: 50 }, dependencies);
			await compileContext({ task: 'second task', maxTokens: 50 }, dependencies);

			const totals = driver.handle
				.query<
					{
						count: number;
						total_considered: number;
						total_emitted: number;
						total_hits: number;
					},
					[]
				>(
					`SELECT COUNT(*) AS count,
							SUM(rows_considered) AS total_considered,
							SUM(rows_emitted) AS total_emitted,
							SUM(cache_hits) AS total_hits
					 FROM compile_runs`,
				)
				.get();
			expect(records).toHaveLength(2);
			expect(totals).toEqual({
			count: 2,
				total_considered: 2,
				total_emitted: 2,
				total_hits: 2,
			});
			expect(records.every((record) => record.cacheHits > 0)).toBe(true);
		} finally {
			driver.close();
		}
	});
});
