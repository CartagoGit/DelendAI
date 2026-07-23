import { describe, expect, it } from 'vitest';

import { discoverRoster } from '../../../../src/lib/discovery/discover-roster';
import type { IDiscoveryDeps } from '../../../../src/lib/contracts/interfaces/roster.interface';

/** A deps double: `onPath` lists the commands that resolve; `env` is verbatim. */
const deps = (
	onPath: readonly string[],
	env: Record<string, string | undefined> = {},
): IDiscoveryDeps => ({
	commandExists: async (command) => onPath.includes(command),
	env,
});

describe('discoverRoster', () => {
	it('detects a CLI on PATH and lists the rest as missing with an install hint', async () => {
		const roster = await discoverRoster(deps(['claude']));
		const claude = roster.available.find((p) => p.id === 'claude-cli');
		expect(claude).toMatchObject({
			source: 'cli',
			vendor: 'anthropic',
			reach: 'claude',
		});
		const codexMissing = roster.missing.find((p) => p.id === 'codex-cli');
		expect(codexMissing?.hint).toContain('install');
		expect(codexMissing?.reason).toContain('PATH');
	});

	it('detects an API provider from its env key', async () => {
		const roster = await discoverRoster(
			deps([], { OPENAI_API_KEY: 'sk-123' }),
		);
		const openai = roster.available.find((p) => p.id === 'openai-api');
		expect(openai).toMatchObject({
			source: 'api',
			vendor: 'openai',
			reach: 'OPENAI_API_KEY',
		});
	});

	it('accepts an ALTERNATE env var name (GOOGLE_API_KEY for Gemini)', async () => {
		const roster = await discoverRoster(deps([], { GOOGLE_API_KEY: 'x' }));
		const google = roster.available.find((p) => p.id === 'google-api');
		expect(google?.reach).toBe('GOOGLE_API_KEY');
	});

	it('treats an empty / whitespace key as NOT present', async () => {
		const roster = await discoverRoster(
			deps([], { ANTHROPIC_API_KEY: '   ' }),
		);
		expect(roster.available.some((p) => p.id === 'anthropic-api')).toBe(
			false,
		);
		expect(roster.missing.some((p) => p.id === 'anthropic-api')).toBe(true);
	});

	it('orders available providers cheapest-first, then by id (stable)', async () => {
		const roster = await discoverRoster(
			deps(['claude'], { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' }),
		);
		const tiers = roster.available.map((p) => p.costTier);
		expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
		// groq (tier 1) before gemini (tier 2) before claude-cli (tier 4)
		expect(roster.available.map((p) => p.id)).toEqual([
			'groq-api',
			'google-api',
			'claude-cli',
		]);
	});

	it('never throws when a CLI probe rejects — treats it as not installed', async () => {
		const roster = await discoverRoster({
			commandExists: async () => {
				throw new Error('spawn EACCES');
			},
			env: {},
		});
		expect(roster.available).toEqual([]);
		expect(roster.missing.length).toBeGreaterThan(0);
	});

	it('an empty environment yields no available providers and every one missing with a fix', async () => {
		const roster = await discoverRoster(deps([], {}));
		expect(roster.available).toEqual([]);
		expect(roster.missing.length).toBeGreaterThan(0);
		for (const m of roster.missing) {
			expect(m.hint.length).toBeGreaterThan(0);
		}
	});

	it('keeps two candidates of the same vendor distinct (Claude CLI + Anthropic API)', async () => {
		const roster = await discoverRoster(
			deps(['claude'], { ANTHROPIC_API_KEY: 'sk' }),
		);
		const anthropic = roster.available.filter(
			(p) => p.vendor === 'anthropic',
		);
		expect(anthropic.map((p) => p.id).sort()).toEqual([
			'anthropic-api',
			'claude-cli',
		]);
	});
});
