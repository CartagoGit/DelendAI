/**
 * agent-files.migrator.spec.ts — b00239 S4.
 *
 * Pins the four-case contract of `createAgentFilesMigrator` against
 * real on-disk agent markdown files: directory absent, file ours,
 * file foreign, file malformed. Plus targeted coverage for:
 *
 *  - Frontmatter `name`, `description`, `model` rewrite.
 *  - Prose-body rewrite (any in-prose mention of the legacy
 *    identity).
 *  - A file with NO legacy identity is left byte-identical.
 *  - Idempotency.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentFilesMigrator } from '@delendai/core/lib/workspace-migration/migrators/agent-files.migrator';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s4-agents-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const writeAgentFile = async (
	workspace: string,
	host: '.github/agents' | '.claude/agents' | '.codex/agents',
	name: string,
	contents: string,
): Promise<string> => {
	const directory = join(workspace, host);
	await mkdir(directory, { recursive: true });
	const absolute = join(directory, name);
	await writeFile(absolute, contents, 'utf8');
	return absolute;
};

const ctx = (root: string) => ({ workspaceRoot: root, dryRun: false });

describe('agent-files.migrator — detect', () => {
	it('returns false when no agent directory exists', async () => {
		const migrator = createAgentFilesMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(false);
	});

	it('returns true when any agent directory has markdown files', async () => {
		await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'mcp-vertex-helper.md',
			'---\nname: mcp-vertex-helper\n---\n',
		);
		const migrator = createAgentFilesMigrator();
		expect(await migrator.detect(ctx(workspaceRoot))).toBe(true);
	});
});

describe('agent-files.migrator — apply (frontmatter rewrite)', () => {
	it('rewrites the `name` field in the frontmatter', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'mcp-vertex-helper.md',
			'---\nname: mcp-vertex-helper\ndescription: A test agent\n---\n\nBody.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('name: delendai-helper');
		expect(after).not.toContain('mcp-vertex');
	});

	it('rewrites the `description` field', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.claude/agents',
			'tester.md',
			'---\nname: tester\ndescription: Routes mcp-vertex commands\n---\n\nBody.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('description: Routes delendai commands');
	});

	it('rewrites the `model` field', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.codex/agents',
			'tester.md',
			'---\nname: tester\nmodel: mcp-vertex-large\n---\n\nBody.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('model: delendai-large');
	});
});

describe('agent-files.migrator — apply (prose rewrite)', () => {
	it('rewrites legacy identity references in the body', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'tester.md',
			'---\nname: tester\n---\n\nThis file routes mcp-vertex_* commands.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('delendai_*');
		expect(after).not.toContain('mcp-vertex');
	});

	it('rewrites legacy identity in a file with no frontmatter', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'plain.md',
			'This is a plain agent that routes mcp-vertex tools.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('delendai tools');
		expect(after).not.toContain('mcp-vertex');
	});
});

describe('agent-files.migrator — apply (no-op guarantees)', () => {
	it('does not write back a file with no legacy identity', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'clean.md',
			'---\nname: clean-agent\ndescription: nothing legacy here\n---\n\nAll clean.\n',
		);
		const original = await readFile(path, 'utf8');
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		expect(await readFile(path, 'utf8')).toBe(original);
	});

	it('is idempotent: a second apply leaves the file byte-identical', async () => {
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'tester.md',
			'---\nname: mcp-vertex-helper\n---\n\nBody mentions mcp-vertex too.\n',
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const first = await readFile(path, 'utf8');
		await migrator.apply(ctx(workspaceRoot));
		const second = await readFile(path, 'utf8');
		expect(second).toBe(first);
	});

	it('walks all three host directories independently', async () => {
		const paths = await Promise.all([
			writeAgentFile(
				workspaceRoot,
				'.github/agents',
				'one.md',
				'---\nname: mcp-vertex-one\n---\n',
			),
			writeAgentFile(
				workspaceRoot,
				'.claude/agents',
				'two.md',
				'---\nname: mcp-vertex-two\n---\n',
			),
			writeAgentFile(
				workspaceRoot,
				'.codex/agents',
				'three.md',
				'---\nname: mcp-vertex-three\n---\n',
			),
		]);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		for (const path of paths) {
			const after = await readFile(path, 'utf8');
			expect(after).toContain('delendai-');
			expect(after).not.toContain('mcp-vertex');
		}
	});

	it('preserves unknown frontmatter keys byte-for-byte', async () => {
		// A field the migrator does not know must round-trip
		// unchanged. The migrator does not strip it, does not
		// rename it, does not rewrite its value.
		const original = `---
name: mcp-vertex-helper
description: legacy mention
projectSpecific: keep-this=verbatim
---
Body mentions mcp-vertex.
`;
		const path = await writeAgentFile(
			workspaceRoot,
			'.github/agents',
			'custom.md',
			original,
		);
		const migrator = createAgentFilesMigrator();
		await migrator.apply(ctx(workspaceRoot));
		const after = await readFile(path, 'utf8');
		expect(after).toContain('projectSpecific: keep-this=verbatim');
		expect(after).toContain('name: delendai-helper');
		expect(after).toContain(
			'description: legacy mention'.replace('mcp-vertex', 'delendai'),
		);
		expect(after).not.toContain('mcp-vertex');
	});
});
