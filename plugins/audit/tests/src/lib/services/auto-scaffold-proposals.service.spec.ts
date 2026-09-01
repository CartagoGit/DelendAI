import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { resolveAutoScaffold } from '../../../../src/lib/services/auto-scaffold-proposals.service';

// Tiny stub of IPeerPluginRegistry for tests. Mirrors the runtime
// contract (list + has) so the helper can be exercised end-to-end
// without needing the core barrel to resolve in the test sandbox.
const makeRegistry = (names: readonly string[]) =>
	({
		list: () => Object.freeze([...names]),
		has: (n: string) => names.includes(n),
	}) as unknown as Parameters<typeof resolveAutoScaffold>[1]['peerPlugins'];

describe('resolveAutoScaffold — proposals availability', async () => {
	const mkTmp = async (): Promise<string> =>
		await mkdtemp(path.join(tmpdir(), 'autoscaf-'));

	it('returns `scaffolded` when the proposals peer plugin IS loaded and opt-in is on', async () => {
		const dir = await mkTmp();
		try {
			const outcome = await resolveAutoScaffold(
				{
					auditsFound: 1,
					skipped: [],
					consensus: [],
					findings: [
						{
							id: 'fatal-1',
							titles: ['Titles persistences'],
							worstSeverity: 'FATAL',
							files: ['packages/core/src/x.ts'],
							seenBy: ['gpt-4o'],
						},
					],
					topActions: [],
				},
				{
					enabled: true,
					peerPlugins: makeRegistry(['proposals', 'audit']),
					proposalsDir: dir,
					workspaceRoot: dir,
				},
			);
			expect(outcome.kind).toBe('scaffolded');
			if (outcome.kind === 'scaffolded') {
				expect(outcome.records.length).toBe(3);
				expect(outcome.records[0]?.kind).toBe('audit');
				expect(outcome.records[1]?.kind).toBe('plan');
				expect(outcome.records[2]?.severity).toBe('FATAL');
				// The proposal file must be on disk.
				expect(
					outcome.records.map((record) => record.relativePath),
				).toEqual([
					'audits/a00001-consolidated-audit-record.md',
					'plans/q00001-implementation-plan-from-audit-findings.md',
					'fixes/x00001-titles-persistences.md',
				]);
				const written = await readFile(
					path.join(dir, outcome.records[0]!.relativePath),
					'utf8',
				);
				expect(written).toContain('kind: audit');
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// x00165 (S-B): the generated proposal body used to embed
	// "Alcance B (f00077)" — an mcp-vertex-internal roadmap slice +
	// proposal id — directly into every scaffolded proposal, for any
	// downstream host. It must now read as a generic, portable note.
	it('scaffolds a proposal body with no mcp-vertex-internal vocabulary leaked into it', async () => {
		const dir = await mkTmp();
		try {
			const outcome = await resolveAutoScaffold(
				{
					auditsFound: 1,
					skipped: [],
					consensus: [],
					findings: [
						{
							id: 'fatal-2',
							titles: ['Leaked vocabulary check'],
							worstSeverity: 'FATAL',
							files: ['src/x.ts'],
							seenBy: ['gpt-4o'],
						},
					],
					topActions: [],
				},
				{
					enabled: true,
					peerPlugins: makeRegistry(['proposals', 'audit']),
					proposalsDir: dir,
					workspaceRoot: dir,
				},
			);
			expect(outcome.kind).toBe('scaffolded');
			if (outcome.kind === 'scaffolded') {
				const written = await readFile(
					path.join(dir, outcome.records[0]!.relativePath),
					'utf8',
				);
				expect(written).not.toContain('Alcance B');
				expect(written).not.toContain('f00077');
				expect(written).not.toContain('MUY_MAL');
				expect(written).not.toContain('MEJORABLE');
				expect(written).toContain('kind: audit');
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('returns `skipped` (proposals-not-loaded) when the proposals peer plugin is NOT loaded', async () => {
		const dir = await mkTmp();
		try {
			const outcome = await resolveAutoScaffold(
				{
					auditsFound: 1,
					skipped: [],
					consensus: [],
					findings: [
						{
							id: 'bad-1',
							titles: ['No proposals plugin'],
							worstSeverity: 'BAD',
							files: [],
							seenBy: ['gpt-4o'],
						},
					],
					topActions: [],
				},
				{
					enabled: true,
					peerPlugins: makeRegistry(['audit']),
					proposalsDir: dir,
					workspaceRoot: dir,
				},
			);
			expect(outcome.kind).toBe('skipped');
			if (outcome.kind === 'skipped') {
				expect(outcome.reason).toBe('proposals-not-loaded');
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('returns `disabled` when the caller opt-out', async () => {
		const outcome = await resolveAutoScaffold(
			{
				auditsFound: 1,
				skipped: [],
				consensus: [],
				findings: [
					{
						id: 'minor-1',
						titles: ['Disabled flag'],
						worstSeverity: 'MINOR',
						files: [],
						seenBy: ['gpt-4o'],
					},
				],
				topActions: [],
			},
			{
				enabled: false,
				peerPlugins: makeRegistry(['proposals', 'audit']),
				proposalsDir: '/tmp',
				workspaceRoot: '/tmp',
			},
		);
		expect(outcome.kind).toBe('disabled');
	});

	it('returns `disabled` when peerPlugins registry is missing (older hosts)', async () => {
		const outcome = await resolveAutoScaffold(
			{
				auditsFound: 1,
				skipped: [],
				consensus: [],
				findings: [],
				topActions: [],
			},
			{
				enabled: true,
				peerPlugins: undefined,
				proposalsDir: '/tmp',
				workspaceRoot: '/tmp',
			},
		);
		expect(outcome.kind).toBe('skipped');
		if (outcome.kind === 'skipped') {
			expect(outcome.reason).toBe('proposals-not-loaded');
		}
	});
});
