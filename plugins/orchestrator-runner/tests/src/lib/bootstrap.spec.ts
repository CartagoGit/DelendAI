import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildProvidersPatch,
	buildRosterDraft,
	composeBootstrapBrief,
	discoverProviders,
	draftProviderEntry,
	parseAuthTier,
	readConfirmedProviders,
	writeRosterDraft,
	type IDiscoveredProvider,
} from '../../../src/lib/bootstrap';
import type { ProbeRunner } from '../../../src/lib/healthcheck/probe';

/**
 * A fake command runner: `installed` CLIs answer `command -v` with a path
 * and `--version` with a version; everything else exits non-zero (missing).
 */
const makeRunner =
	(installed: Readonly<Record<string, string>>): ProbeRunner =>
	async (command) => {
		const whichMatch = command.match(/^command -v (\S+)$/);
		if (whichMatch) {
			const cli = whichMatch[1] ?? '';
			const path = installed[cli];
			return path ? { code: 0, output: path } : { code: 1, output: '' };
		}
		const verMatch = command.match(/^(\S+) --version$/);
		if (verMatch && installed[verMatch[1] ?? '']) {
			return { code: 0, output: `${verMatch[1]} 1.2.3` };
		}
		return { code: 1, output: '' };
	};

describe('discoverProviders', () => {
	it('splits installed CLIs into detected and the rest into missing (with hints)', async () => {
		const runner = makeRunner({
			claude: '/usr/bin/claude',
			codex: '/usr/bin/codex',
		});
		const result = await discoverProviders(runner, '/ws');

		expect(result.detected.map((d) => d.id).sort()).toEqual([
			'claude',
			'codex',
		]);
		const claude = result.detected.find((d) => d.id === 'claude');
		expect(claude?.cliPath).toBe('/usr/bin/claude');
		expect(claude?.version).toBe('claude 1.2.3');
		expect(claude?.authTier).toBeNull();

		// The other four are missing and each carries an install hint.
		expect(result.missing.map((m) => m.id).sort()).toEqual([
			'agent',
			'aider',
			'cn',
			'copilot',
		]);
		const cn = result.missing.find((m) => m.id === 'cn');
		expect(cn?.installHint.dangerous).toBe(true);
		expect(cn?.installHint.pipeTo).toBe('sh');
	});

	it('reports all six as missing when PATH is empty', async () => {
		const result = await discoverProviders(makeRunner({}), '/ws');
		expect(result.detected).toEqual([]);
		expect(result.missing).toHaveLength(6);
	});
});

describe('parseAuthTier', () => {
	it('matches a known tier keyword case-insensitively', () => {
		expect(parseAuthTier('Account tier: Pro (active)')).toBe('Pro');
		expect(parseAuthTier('subscription = max plan')).toBe('Max');
		expect(parseAuthTier('logged in, ENTERPRISE seat')).toBe('Enterprise');
	});
	it('returns null when no tier keyword is present', () => {
		expect(parseAuthTier('authenticated as alice@example.com')).toBeNull();
	});
});

describe('buildProvidersPatch (RFC 6902, CRITICAL I13)', () => {
	const detected: readonly IDiscoveredProvider[] = [
		{ id: 'claude', cliPath: '/c', version: null, authTier: 'Pro' },
		{ id: 'codex', cliPath: '/x', version: null, authTier: null },
	];

	it('creates /providers then appends each provider when config has none', () => {
		const ops = buildProvidersPatch(null, detected);
		expect(ops[0]).toEqual({ op: 'add', path: '/providers', value: [] });
		expect(ops.slice(1).map((o) => o.path)).toEqual([
			'/providers/-',
			'/providers/-',
		]);
		const firstProvider = ops[1];
		if (firstProvider === undefined)
			throw new Error('missing first provider');
		expect((firstProvider.value as { id: string }).id).toBe('claude');
	});

	it('is non-destructive: skips ids already confirmed, no /providers create', () => {
		const ops = buildProvidersPatch([{ id: 'claude' }], detected);
		// /providers already exists → no create op; claude already present.
		expect(ops).toHaveLength(1);
		const provider = ops[0];
		if (provider === undefined) throw new Error('missing provider');
		expect(provider.path).toBe('/providers/-');
		expect((provider.value as { id: string }).id).toBe('codex');
	});

	it('emits well-typed cli provider entries with placeholders to edit', () => {
		const entry = draftProviderEntry(detected[0] as IDiscoveredProvider);
		expect(entry.kind).toBe('cli');
		expect(entry.invoke).toEqual({ kind: 'cli', command: 'claude' });
		expect(entry.costTier).toBe(3);
		expect(entry.modelId).toMatch(/SET-MODEL-ID/);
	});
});

describe('readConfirmedProviders', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'or-boot-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('returns null for a missing config file (fresh workspace)', async () => {
		expect(await readConfirmedProviders(join(dir, 'nope.json'))).toBeNull();
	});

	it('writes a redacted roster draft that round-trips as JSON', async () => {
		const path = join(dir, 'roster.draft.json');
		const draft = buildRosterDraft(
			{
				detected: [
					{
						id: 'claude',
						cliPath: '/c',
						version: null,
						authTier: 'Pro',
					},
				],
				missing: [],
			},
			new Date('2026-07-04T00:00:00.000Z'),
		);
		await writeRosterDraft(path, draft);
		const parsed = JSON.parse(await readFile(path, 'utf8')) as {
			schema: string;
			detected: unknown[];
		};
		expect(parsed.schema).toBe(
			'delendai/orchestrator-runner/roster-draft/1',
		);
		expect(parsed.detected).toHaveLength(1);
	});
});

describe('composeBootstrapBrief', () => {
	it('summarizes detections and asks the cost/task questions', () => {
		const brief = composeBootstrapBrief({
			detected: [
				{ id: 'claude', cliPath: '/c', version: null, authTier: 'Pro' },
			],
			missing: [
				{
					id: 'cn',
					installHint: {
						tool: 'curl',
						args: [],
						pipeTo: 'sh',
						dangerous: true,
						caveat: 'x',
					},
				},
			],
		});
		expect(brief).toMatch(/Detected 1 provider/);
		expect(brief).toMatch(/claude \(Pro\)/);
		expect(brief).toMatch(/spend preference/);
		expect(brief).toMatch(/RFC 6902/);
	});

	it('tells the user to install something when nothing was detected', () => {
		const brief = composeBootstrapBrief({ detected: [], missing: [] });
		expect(brief).toMatch(/No provider CLIs were found/);
	});
});
