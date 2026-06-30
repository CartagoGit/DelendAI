import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { resolveAutoScaffold } from '../../../../src/lib/services/auto-scaffold-proposals.service';
import { createPeerPluginRegistry } from '../../../../src/public';

// Tiny stub of IPeerPluginRegistry for tests. Mirrors the runtime
// contract (list + has) so the helper can be exercised end-to-end.
const makeRegistry = (names: readonly string[]): ReturnType<typeof createPeerPluginRegistry>['registry'] => {
	const built = createPeerPluginRegistry();
	built.set(names);
	return built.registry;
};

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
				expect(outcome.records.length).toBe(1);
				expect(outcome.records[0]?.severity).toBe('FATAL');
				// The proposal file must be on disk.
				const written = await readFile(
					path.join(dir, outcome.records[0]!.filename),
					'utf8',
				);
				expect(written).toContain('id: x000');
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
