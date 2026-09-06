/**
 * vscode.migrator.spec.ts — b00239 S4.
 *
 * Pins the four-case contract of `createVscodeMigrator` against a
 * real on-disk extension manifest: file absent, file ours, file
 * foreign, file malformed. Plus targeted coverage for:
 *
 *  - `publisher`, `name`, `displayName`, `description` rewrite.
 *  - `contributes.commands[].command` and `.category` rewrite.
 *  - `contributes.viewsContainers.activitybar[].id` rewrite.
 *  - `contributes.productIconThemes[].path` rewrite.
 *  - `activationEvents` rewrite (e.g. the workspaceContains event for the config file).
 *  - Untouched fields (e.g. `version`, `engines`) are preserved.
 *  - Idempotency.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	VSCODE_MANIFEST_PATH,
	VscodeManifestParseError,
	createVscodeMigrator,
} from '@delendai/core/lib/workspace-migration/migrators/vscode.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-vscode-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeVscodeManifest = async (
	workspace: string,
	contents: string,
): Promise<string> => {
	const absolute = join(workspace, VSCODE_MANIFEST_PATH);
	await mkdir(join(workspace, 'extensions', 'vscode'), { recursive: true });
	await writeFile(absolute, contents, 'utf8');
	return absolute;
};

const ctx = (root: string) => ({ workspaceRoot: root, dryRun: false });

const pretty = (value: unknown): string =>
	`${JSON.stringify(value, null, '\t')}\n`;

describe('vscode.migrator — detect / plan', () => {
	it('detect returns false when the manifest is absent', async () => {
		const migrator = createVscodeMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(false);
	});

	it('plan returns no steps when the manifest is clean', async () => {
		await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'delendai-vscode',
				displayName: 'DelendAI for VS Code',
				version: '0.1.0',
				publisher: 'cartago',
			}),
		);
		const migrator = createVscodeMigrator();
		expect(await migrator.plan(ctx(workspaceRoot))).toEqual([]);
	});

	it('plan emits a rewrite step when the manifest carries legacy identity', async () => {
		await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				displayName: 'MCP Vertex for VS Code',
				version: '0.1.0',
			}),
		);
		const migrator = createVscodeMigrator();
		const steps = await migrator.plan(ctx(workspaceRoot));
		expect(steps).toHaveLength(1);
		expect(steps[0]?.kind).toBe('rewrite-vscode-manifest');
	});
});

describe('vscode.migrator — apply (top-level fields)', () => {
	it('rewrites name, displayName and description', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				displayName: 'MCP Vertex for VS Code',
				description: 'VS Code host for mcp-vertex.',
				version: '0.1.0',
				publisher: 'cartago',
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.name).toBe('delendai-vscode');
		expect(after.displayName).toBe('DelendAI for VS Code');
		expect(after.description).toBe('VS Code host for delendai.');
		expect(after.version).toBe('0.1.0');
		expect(after.publisher).toBe('cartago');
	});

	it('rewrites activationEvents that mention the legacy identity', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				version: '0.1.0',
				activationEvents: [
					'onStartupFinished',
					'workspaceContains:**/mcp-vertex.config.json',
				],
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.activationEvents).toEqual([
			'onStartupFinished',
			'workspaceContains:**/delendai.config.json',
		]);
	});
});

describe('vscode.migrator — apply (contributes.* walk)', () => {
	it('rewrites command ids and categories', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				version: '0.1.0',
				contributes: {
					commands: [
						{
							command: 'mcp-vertex.openOverview',
							title: 'Open Overview',
							category: 'MCP Vertex',
						},
						{
							command: 'mcp-vertex.runValidation',
							title: 'Run Validation',
							category: 'MCP Vertex',
						},
					],
				},
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.contributes.commands[0].command).toBe(
			'delendai.openOverview',
		);
		expect(after.contributes.commands[0].category).toBe('DelendAI');
		expect(after.contributes.commands[1].command).toBe(
			'delendai.runValidation',
		);
	});

	it('rewrites viewsContainers.activitybar ids and titles', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				version: '0.1.0',
				contributes: {
					viewsContainers: {
						activitybar: [
							{ id: 'mcp-vertex', title: 'mcp-vertex' },
						],
					},
					views: {
						'mcp-vertex': [
							{ id: 'mcp-vertex.dashboard', name: 'Dashboard' },
						],
					},
				},
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.contributes.viewsContainers.activitybar[0].id).toBe(
			'delendai',
		);
		expect(after.contributes.viewsContainers.activitybar[0].title).toBe(
			'delendai',
		);
		expect(Object.keys(after.contributes.views)).toEqual(['delendai']);
		expect(after.contributes.views.delendai[0].id).toBe(
			'delendai.dashboard',
		);
	});

	it('rewrites productIconThemes paths and ids', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				version: '0.1.0',
				contributes: {
					productIconThemes: [
						{
							id: 'mcp-vertex-icons',
							label: 'MCP Vertex Product Icons',
							path: './media/icons/mcp-vertex-product-icon-theme.json',
						},
					],
				},
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.contributes.productIconThemes[0].id).toBe(
			'delendai-icons',
		);
		expect(after.contributes.productIconThemes[0].label).toBe(
			'DelendAI Product Icons',
		);
		expect(after.contributes.productIconThemes[0].path).toBe(
			'./media/icons/delendai-product-icon-theme.json',
		);
	});

	it('preserves fields outside the allow-list untouched', async () => {
		// `version`, `engines`, `main`, `repository`, `categories`,
		// `extensionKind` must pass through unchanged even if their
		// strings happen to mention the legacy identity — they
		// don't, but the contract is "allow-list only".
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				version: '0.1.0',
				engines: { vscode: '^1.90.0' },
				main: './extension.js',
				extensionKind: ['workspace'],
				categories: ['Other'],
				repository: {
					type: 'git',
					url: 'git@github.com/foo/mcp-vertex.git',
				},
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = JSON.parse(await readFile(path, 'utf8'));
		expect(after.version).toBe('0.1.0');
		expect(after.engines).toEqual({ vscode: '^1.90.0' });
		expect(after.main).toBe('./extension.js');
		expect(after.extensionKind).toEqual(['workspace']);
		expect(after.categories).toEqual(['Other']);
		expect(after.repository).toEqual({
			type: 'git',
			url: 'git@github.com/foo/mcp-vertex.git',
		});
	});
});

describe('vscode.migrator — apply (failure modes and idempotency)', () => {
	it('throws VscodeManifestParseError on malformed JSON', async () => {
		await writeVscodeManifest(
			workspaceRoot,
			'{ "name": "mcp-vertex-vscode",,, }\n',
		);
		const migrator = createVscodeMigrator();
		await expect(migrator.apply(ctx(workspaceRoot))).rejects.toBeInstanceOf(
			VscodeManifestParseError,
		);
	});

	it('does not write back the file when the parse fails', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			'{ "name": "mcp-vertex-vscode",,, }\n',
		);
		const original = await readFile(path, 'utf8');
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot)).catch(() => undefined);
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('no-ops cleanly when the file is absent', async () => {
		const migrator = createVscodeMigrator();
		await expect(
			migrator.apply(ctx(workspaceRoot)),
		).resolves.toBeUndefined();
	});

	it('does not write the file when nothing carries legacy identity', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'delendai-vscode',
				displayName: 'DelendAI for VS Code',
				version: '0.1.0',
			}),
		);
		const original = await readFile(path, 'utf8');
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('is idempotent: a second apply leaves the file byte-identical', async () => {
		const path = await writeVscodeManifest(
			workspaceRoot,
			pretty({
				name: 'mcp-vertex-vscode',
				displayName: 'MCP Vertex for VS Code',
				version: '0.1.0',
				contributes: {
					commands: [
						{
							command: 'mcp-vertex.openOverview',
							title: 'Open Overview',
							category: 'MCP Vertex',
						},
					],
				},
			}),
		);
		const migrator = createVscodeMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const first = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const second = await readFile(path, 'utf8');
		expect(second).toBe(first);
	});
});
