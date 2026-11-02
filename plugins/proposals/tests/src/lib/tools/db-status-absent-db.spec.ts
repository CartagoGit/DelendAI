/**
 * db-status with no database on disk (x00533).
 *
 * Split from `db-status.tool.spec.ts`, which covers the tool's SHAPE —
 * schemas exported, materializer refused, output schema rejecting a
 * malformed payload. This file covers its BEHAVIOUR, and exists because
 * x00533's acceptance ("with the database absent it returns
 * `exists: false` and zero counters, without error") was only ever
 * checked by feeding a hand-typed object to
 * `proposalsDbStatusOutputSchema.parse`. That proves the schema accepts
 * the shape; it would pass just as happily if the handler threw on a
 * missing file. These call the handler.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';
import { createFakeToolServer } from '@delendai/test-kit/public';

import {
	buildDbStatusToolRegistration,
	proposalsDbStatusOutputSchema,
	type IProposalsDbStatusOutput,
} from '../../../../src/lib/tools/db-status.tool';
import type { IProposalReader } from '../../../../src/lib/contracts/interfaces/materializer.interface';

const buildReaderStub = (
	overrides: Partial<{
		count: IProposalReader['count'];
		lastSync: IProposalReader['lastSync'];
	}> = {},
): IProposalReader => ({
	get: async () => undefined,
	list: async () => [],
	search: async () => [],
	count:
		overrides.count ??
		(async () => ({ proposals: 0, plans: 0, slices: 0 })),
	lastSync:
		overrides.lastSync ??
		(async () => ({ at: undefined, sourceCommit: undefined })),
	suggest: async () => [],
});

/**
 * Run the tool's real handler by capturing it at registration.
 *
 * x00533's acceptance says "with the database absent it returns
 * `exists: false` and zero counters, without error". The spec below it
 * only fed a hand-typed object to `proposalsDbStatusOutputSchema.parse`
 * — which proves the schema accepts that shape, and would pass just as
 * happily if the handler threw on a missing file. This calls the thing.
 */
const captureHandler = async (
	options: Parameters<typeof buildDbStatusToolRegistration>[0],
): Promise<(args: unknown) => Promise<unknown>> => {
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await buildDbStatusToolRegistration(options).register(
		createFakeToolServer({
			onRegisterTool: (registered) => {
				handler = registered.handler as (
					args: unknown,
				) => Promise<unknown>;
			},
		}),
	);
	if (handler === undefined) throw new Error('tool registered no handler');
	return handler;
};

describe('proposals_db_status with no database on disk (x00533)', () => {
	it('reports exists:false and zero counters instead of failing', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'db-status-absent-'));
		try {
			const handler = await captureHandler({
				workspaceRoot: workspace,
				proposalsDirAbs: join(workspace, 'docs/delendai/proposals'),
				reader: buildReaderStub({
					// If the tool consulted the reader with no database
					// present, these would blow up rather than report zero —
					// which is the distinction the acceptance is making.
					count: async () => {
						throw new Error('reader must not be consulted');
					},
					lastSync: async () => {
						throw new Error('reader must not be consulted');
					},
				}),
			});

			const result = (await handler({})) as {
				structuredContent: IProposalsDbStatusOutput;
			};
			const status = result.structuredContent;

			expect(status.exists).toBe(false);
			expect(status.proposals).toBe(0);
			expect(status.plans).toBe(0);
			expect(status.slices).toBe(0);
			expect(status.quarantineCount).toBe(0);
			expect(status.databaseSizeBytes).toBe(0);
			expect(status.lastSyncAt).toBeNull();
			expect(status.sourceCommit).toBeNull();
			// And the shape it really returns satisfies the schema it
			// declares — not a shape somebody typed into the assertion.
			expect(() =>
				proposalsDbStatusOutputSchema.parse(status),
			).not.toThrow();
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('derives the database path from the shared resolver, not a local join', async () => {
		// x00533 S1: one function decides where `proposals.sqlite` lives.
		// A tool that rebuilt the path by hand would diagnose a different
		// file from the one the reconciler writes.
		const workspace = mkdtempSync(join(tmpdir(), 'db-status-path-'));
		try {
			const handler = await captureHandler({
				workspaceRoot: workspace,
				proposalsDirAbs: join(workspace, 'docs/delendai/proposals'),
				reader: buildReaderStub(),
			});
			const result = (await handler({})) as {
				structuredContent: IProposalsDbStatusOutput;
			};

			expect(result.structuredContent.databasePath).toBe(
				resolveProposalsDbPaths(workspace).databasePath,
			);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});
});
