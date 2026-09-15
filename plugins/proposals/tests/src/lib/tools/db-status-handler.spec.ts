/**
 * db-status-handler.spec.ts — the `proposals_db_status` handler's
 * branches through its registration: a failing reader, the quarantine
 * count, a sync that recorded nothing, default index names and a host
 * namespace. Split from `db-status.tool.spec.ts` to keep both files
 * under the size limit.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import {
	DB_STATUS_REGISTRATION_ID,
	buildDbStatusToolRegistration,
	type IProposalsDbStatusOutput,
} from '../../../../src/lib/tools/db-status.tool';
import type { IProposalReader } from '../../../../src/lib/contracts/interfaces/materializer.interface';

/** A reader whose count and last sync the case decides; the rest is inert. */
const readerWith = (answers: {
	readonly count?: IProposalReader['count'];
	readonly lastSync?: IProposalReader['lastSync'];
}): IProposalReader => {
	const inert = {
		get: async () => undefined,
		list: async () => [],
		search: async () => [],
		suggest: async () => [],
	};
	return {
		...inert,
		count:
			answers.count ??
			(async () => ({ proposals: 1, plans: 1, slices: 1 })),
		lastSync:
			answers.lastSync ??
			(async () => ({ at: undefined, sourceCommit: undefined })),
	};
};

describe('proposals_db_status handler branches', () => {
	const serve = async (
		options: Parameters<typeof buildDbStatusToolRegistration>[0],
	) => {
		const registered: Array<{
			name: string;
			handler: (args: unknown) => unknown;
		}> = [];
		await buildDbStatusToolRegistration(options).register(
			createFakeToolServer({
				onRegisterTool: ({ name, handler }) => {
					registered.push({ name, handler });
				},
			}),
		);
		return registered[0]!;
	};

	const statusOf = async (
		tool: { handler: (args: unknown) => unknown },
		args: unknown,
	): Promise<IProposalsDbStatusOutput> =>
		(
			(await tool.handler(args)) as {
				structuredContent: IProposalsDbStatusOutput;
			}
		).structuredContent;

	const withWorkspace = async (
		run: (tmp: string, sqlitePath: string) => Promise<void>,
	): Promise<void> => {
		const tmp = mkdtempSync(join(tmpdir(), 'proposals-db-status-'));
		try {
			const sqlitePath = join(tmp, 'proposals.sqlite');
			writeFileSync(sqlitePath, 'fake sqlite bytes');
			await run(tmp, sqlitePath);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	};

	it('reports zero counts when the reader fails, and counts quarantine on request', async () => {
		await withWorkspace(async (tmp, sqlitePath) => {
			const tool = await serve({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				proposalsSqlitePath: sqlitePath,
				reader: readerWith({
					count: async () => {
						throw new Error('corrupt database');
					},
				}),
			});

			const data = await statusOf(tool, { includeQuarantine: true });

			expect(data).toMatchObject({
				exists: true,
				proposals: 0,
				plans: 0,
				slices: 0,
				lastSyncAt: null,
				sourceCommit: null,
				quarantineCount: 0,
			});
		});
	});

	it('reports a sync that recorded no time or commit as null', async () => {
		await withWorkspace(async (tmp, sqlitePath) => {
			const tool = await serve({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				proposalsSqlitePath: sqlitePath,
				reader: readerWith({}),
			});

			const data = await statusOf(tool, {});

			expect(data.exists).toBe(true);
			expect(data.lastSyncAt).toBeNull();
			expect(data.sourceCommit).toBeNull();
		});
	});

	it('falls back to the default index names when the host lists fewer', async () => {
		await withWorkspace(async (tmp, sqlitePath) => {
			const tool = await serve({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				proposalsSqlitePath: sqlitePath,
				reader: readerWith({}),
				indexFiles: [],
			});

			const data = await statusOf(tool, {});

			expect(data.indexes).toMatchObject({
				root: false,
				plans: false,
				slices: false,
			});
		});
	});

	it('prefixes the tool name for a non-default namespace', async () => {
		await withWorkspace(async (tmp, sqlitePath) => {
			const tool = await serve({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				proposalsSqlitePath: sqlitePath,
				reader: readerWith({}),
				namespacePrefix: 'work',
			});

			expect(tool.name).toBe(`work_${DB_STATUS_REGISTRATION_ID}`);
		});
	});
});
