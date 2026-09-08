/**
 * db-reconcile-registration.spec.ts — f00534 S2.
 *
 * `bun test`, never vitest (bun:sqlite).
 *
 * The one property this slice must not get wrong: registering the
 * plugin is FREE. `proposals_db_reconcile` is the first production
 * writer of `.delendai/state/proposals.sqlite`, and the temptation is
 * to bootstrap the database at boot so the SQL readers stop returning
 * null. That would make every session — including sessions that never
 * touch a proposal — pay for a full markdown projection. The cost is
 * paid on invocation, and only then.
 *
 * So: `register()` must not open, create, or even bring the state
 * directory into existence. This spec asserts that against a pristine
 * temp workspace, then invokes the tool and watches the database appear.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import plugin from '@delendai/proposals';
import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';

import {
	PROPOSALS_TOOL_DISCLOSURE,
	PROPOSALS_TOOL_IDS,
} from '../../../../src/lib/surface/disclosure';
import { DB_RECONCILE_REGISTRATION_ID } from '../../../../src/lib/tools/db-reconcile.tool';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'db-reconcile-reg-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals'), { recursive: true });
	return root;
};

const ctxFor = (root: string): IMcpPluginContext =>
	({
		workspace: {
			root,
			resolve: (relativePath: string) => join(root, relativePath),
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
	}) as IMcpPluginContext;

describe('proposals_db_reconcile registration (f00534 S2)', () => {
	it('is registered, exactly once, in the plugin tool list', async () => {
		const registrations = await plugin.register(ctxFor(makeWorkspace()));
		const ids = (registrations.tools ?? []).map((tool) => tool.id);
		expect(
			ids.filter((id) => id === DB_RECONCILE_REGISTRATION_ID),
		).toHaveLength(1);
	});

	it('is classified administrative by the closed disclosure union', async () => {
		expect(PROPOSALS_TOOL_IDS).toContain(DB_RECONCILE_REGISTRATION_ID);
		expect(PROPOSALS_TOOL_DISCLOSURE[DB_RECONCILE_REGISTRATION_ID]).toBe(
			'administrative',
		);
		const registrations = await plugin.register(ctxFor(makeWorkspace()));
		const entry = (registrations.tools ?? []).find(
			(tool) => tool.id === DB_RECONCILE_REGISTRATION_ID,
		);
		// The level travels through `applyProposalsDisclosure`, not
		// through a tag carried on the builder: the closed union stays the
		// single place a tool's level is decided.
		expect(entry?.disclosure).toBe('administrative');
	});

	it('register() neither opens nor creates the database, nor its state dir', async () => {
		const root = makeWorkspace();
		const paths = resolveProposalsDbPaths(root);

		await plugin.register(ctxFor(root));

		expect(existsSync(paths.databasePath)).toBe(false);
		expect(existsSync(paths.stagingPath)).toBe(false);
		expect(existsSync(paths.stateDir)).toBe(false);
		expect(existsSync(join(root, '.delendai'))).toBe(false);
	});

	it('registering every tool on a server still creates no database', async () => {
		const root = makeWorkspace();
		const paths = resolveProposalsDbPaths(root);
		const registrations = await plugin.register(ctxFor(root));
		const fakeServer = { registerTool: () => undefined } as never;
		for (const tool of registrations.tools ?? []) {
			await tool.register(fakeServer);
		}
		expect(existsSync(paths.stateDir)).toBe(false);
		expect(existsSync(paths.databasePath)).toBe(false);
	});

	it('the database appears only once the tool is actually invoked', async () => {
		const root = makeWorkspace();
		const paths = resolveProposalsDbPaths(root);
		const registrations = await plugin.register(ctxFor(root));
		const entry = (registrations.tools ?? []).find(
			(tool) => tool.id === DB_RECONCILE_REGISTRATION_ID,
		);
		expect(entry).toBeDefined();

		type THandler = (
			args: Record<string, unknown>,
		) => Promise<{ structuredContent?: Record<string, unknown> }>;
		let handler: THandler | undefined;
		await entry?.register({
			registerTool: (_name: string, _schema: unknown, fn: THandler) => {
				handler = fn;
			},
		} as never);
		expect(handler).toBeDefined();
		expect(existsSync(paths.databasePath)).toBe(false);

		const result = await handler?.({ sourceCommit: 'invoked-once' });
		const output = result?.structuredContent as
			| { status: string; created: boolean; databasePath: string }
			| undefined;

		expect(output?.status).toBe('ok');
		expect(output?.created).toBe(true);
		expect(output?.databasePath).toBe(paths.databasePath);
		expect(existsSync(paths.databasePath)).toBe(true);
	});
});
