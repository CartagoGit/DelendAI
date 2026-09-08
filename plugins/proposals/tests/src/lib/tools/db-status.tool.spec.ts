/**
 * db-status.tool.spec.ts — x00510 S3.
 *
 * Validates the read-only diagnostic tool:
 *   1. The tool shape (input/output schemas) is exported and stable.
 *   2. The tool refuses to be wired with a materializer (defence-in-depth).
 *   3. The output schema covers every field the operator needs to see.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import plugin from '@delendai/proposals';

import {
	DB_STATUS_REGISTRATION_ID,
	DEFAULT_INDEX_FILES,
	RUNTIME_INDEX_RELATIVE_PATH,
	buildDbStatusToolRegistration,
	proposalsDbStatusInputSchema,
	proposalsDbStatusOutputSchema,
	type IProposalsDbStatusOutput,
} from '../../../../src/lib/tools/db-status.tool';
import type {
	IProposalMaterializer,
	IProposalReader,
} from '../../../../src/lib/contracts/interfaces/materializer.interface';

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

const buildMaterializerStub = (): IProposalMaterializer => ({
	materialize: async () => ({
		kind: 'rejected',
		errorCode: 'UNKNOWN',
		errorMessage: 'test stub',
	}),
});

describe('proposals_db_status tool (x00510 S3)', () => {
	it('exposes an input schema and an output schema', () => {
		expect(proposalsDbStatusInputSchema).toBeDefined();
		expect(proposalsDbStatusOutputSchema).toBeDefined();
		const parsed = proposalsDbStatusOutputSchema.parse({
			exists: false,
			proposals: 0,
			plans: 0,
			slices: 0,
			indexes: {
				runtime: false,
				runtimePath: '/tmp/.cache/delendai/proposals/index.json',
				root: false,
				plans: false,
				slices: false,
			},
			lastSyncAt: null,
			sourceCommit: null,
			quarantineCount: 0,
			databasePath: '/tmp/proposals.sqlite',
			databaseSizeBytes: 0,
			checkedAt: 0,
		});
		expect(parsed.exists).toBe(false);
	});

	it('rejects a tool wired with a materializer (READ != WRITE guard)', () => {
		const tmp = mkdtempSync(join(tmpdir(), 'proposals-db-status-'));
		try {
			// The static type already rejects a materializer in
			// `IDbStatusToolOptions` (it is declared `never`). We force
			// it past the type checker to verify the runtime guard
			// still fires when an opts bag sneaks one in.
			const malformedOptions = {
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				reader: buildReaderStub(),
				materializer: buildMaterializerStub(),
			} as unknown as Parameters<typeof buildDbStatusToolRegistration>[0];
			expect(() =>
				buildDbStatusToolRegistration(malformedOptions),
			).toThrowError(/READ_ONLY_VIOLATION|DLND-PROP-007/);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('builds a registration with a reader and no materializer', () => {
		const tmp = mkdtempSync(join(tmpdir(), 'proposals-db-status-'));
		try {
			const reg = buildDbStatusToolRegistration({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				reader: buildReaderStub(),
			});
			expect(reg.id).toBe(DB_STATUS_REGISTRATION_ID);
			expect(typeof reg.register).toBe('function');
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('DEFAULT_INDEX_FILES lists the three legacy indexes', () => {
		expect(DEFAULT_INDEX_FILES).toEqual([
			'INDEX.json',
			'plans/INDEX.json',
			'slices/INDEX.json',
		]);
	});

	it('the output schema rejects a malformed payload', () => {
		// missing fields — `parse` must reject this object.
		expect(() =>
			proposalsDbStatusOutputSchema.parse({ exists: false }),
		).toThrow();
	});

	it('the registered tool returns a coherent shape even when the DB is absent', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'proposals-db-status-'));
		try {
			const reg = buildDbStatusToolRegistration({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				reader: buildReaderStub(),
			});

			let toolHandler: ((args: unknown) => Promise<unknown>) | undefined;
			const fakeServer = {
				registerTool: (
					_name: string,
					_meta: unknown,
					handler: typeof toolHandler,
				) => {
					toolHandler = handler;
				},
			};
			await reg.register(
				fakeServer as unknown as Parameters<typeof reg.register>[0],
			);

			expect(toolHandler).toBeDefined();
			const result = (await toolHandler?.({})) as {
				structuredContent: IProposalsDbStatusOutput & { ok: boolean };
			};
			expect(result.structuredContent.ok).toBe(true);
			const data = result.structuredContent;
			expect(data.exists).toBe(false);
			expect(data.proposals).toBe(0);
			expect(data.plans).toBe(0);
			expect(data.slices).toBe(0);
			expect(data.quarantineCount).toBe(0);
			expect(data.indexes.runtime).toBe(false);
			expect(data.indexes.runtimePath).toBe(
				join(tmp, RUNTIME_INDEX_RELATIVE_PATH),
			);
			expect(data.indexes.root).toBe(false);
			expect(data.indexes.plans).toBe(false);
			expect(data.indexes.slices).toBe(false);
			expect(data.lastSyncAt).toBeNull();
			expect(data.sourceCommit).toBeNull();
			expect(data.databasePath).toContain('proposals.sqlite');
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('the registered tool reports counts and lastSyncAt when the DB exists', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'proposals-db-status-'));
		try {
			const sqlitePath = join(tmp, 'proposals.sqlite');
			writeFileSync(sqlitePath, 'fake sqlite bytes for the size check');

			const reader = buildReaderStub({
				count: async () => ({ proposals: 7, plans: 2, slices: 11 }),
				lastSync: async () => ({
					at: 1700000000000,
					sourceCommit: 'deadbeef',
				}),
			});

			const reg = buildDbStatusToolRegistration({
				workspaceRoot: tmp,
				proposalsDirAbs: tmp,
				proposalsSqlitePath: sqlitePath,
				reader,
			});

			let toolHandler: ((args: unknown) => Promise<unknown>) | undefined;
			const fakeServer = {
				registerTool: (
					_name: string,
					_meta: unknown,
					handler: typeof toolHandler,
				) => {
					toolHandler = handler;
				},
			};
			await reg.register(
				fakeServer as unknown as Parameters<typeof reg.register>[0],
			);

			const result = (await toolHandler?.({
				includeQuarantine: false,
			})) as {
				structuredContent: IProposalsDbStatusOutput & { ok: boolean };
			};
			expect(result.structuredContent.ok).toBe(true);
			const data = result.structuredContent;
			expect(data.exists).toBe(true);
			expect(data.proposals).toBe(7);
			expect(data.plans).toBe(2);
			expect(data.slices).toBe(11);
			expect(data.lastSyncAt).toBe(1700000000000);
			expect(data.sourceCommit).toBe('deadbeef');
			expect(data.databaseSizeBytes).toBeGreaterThan(0);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});

/**
 * x00533 S2 — the acceptance that matters.
 *
 * `db-status.tool.ts` compiled, exported, and was fully unit-tested for
 * a whole slice while having exactly ONE reference in `src`: its own
 * definition. Every test above this line passes with the tool absent
 * from the plugin's surface, because they call the builder directly.
 *
 * These tests do not. They assemble the REAL plugin through
 * `plugin.register()` and assert the registration is in the list the
 * host receives, and that registering it puts a wire-level tool on the
 * server. Delete the `buildDbStatusToolRegistration({...})` entry from
 * `plugins/proposals/src/index.ts` and both go red.
 */
describe('proposals_db_status is REGISTERED on the plugin surface (x00533 S2)', () => {
	const pluginCtx = (): IMcpPluginContext =>
		({
			workspace: {
				root: '/ws',
				resolve: (relativePath: string) => `/ws/${relativePath}`,
			},
			corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: '.cache/delendai/proposals',
			pluginDocsDir: 'docs/delendai/proposals',
			namespacePrefix: 'proposals',
			options: {},
			args: {},
		}) as unknown as IMcpPluginContext;

	it('appears in the plugin tool registrations', async () => {
		const registrations = await plugin.register(pluginCtx());
		const ids = (registrations.tools ?? []).map((tool) => tool.id);
		expect(ids).toContain(DB_STATUS_REGISTRATION_ID);
	});

	it('is tagged administrative, so it is discoverable but not static-listed', async () => {
		const registrations = await plugin.register(pluginCtx());
		const reg = (registrations.tools ?? []).find(
			(tool) => tool.id === DB_STATUS_REGISTRATION_ID,
		);
		expect(reg).toBeDefined();
		expect(reg?.disclosure).toBe('administrative');
	});

	it('puts a namespaced wire tool on the server when the host registers it', async () => {
		const registrations = await plugin.register(pluginCtx());
		const reg = (registrations.tools ?? []).find(
			(tool) => tool.id === DB_STATUS_REGISTRATION_ID,
		);
		expect(reg).toBeDefined();

		const registeredNames: string[] = [];
		const fakeServer = {
			registerTool: (name: string) => {
				registeredNames.push(name);
			},
		};
		await reg?.register(
			fakeServer as unknown as Parameters<
				NonNullable<typeof reg>['register']
			>[0],
		);
		expect(registeredNames).toEqual(['proposals_db_status']);
	});
});
