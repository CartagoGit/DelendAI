import { describe, expect, it } from 'vitest';

import {
	parseCliArgs,
	resolvePreset,
} from '@mcp-vertex/core/lib/plugins/parse-cli-args';

describe('parseCliArgs', async () => {
	it('applies defaults when nothing is passed', async () => {
		const args = parseCliArgs([], '/cwd');
		expect(args.plugins).toEqual([]);
		expect(args.cacheDir).toBe('.cache/mcp-vertex');
		expect(args.docsDir).toBe('docs/mcp-vertex');
		expect(args.workspace).toBe('/cwd');
		expect(args.mcpProjectCreate).toBe(true);
		expect(args.mcpProjectTests).toBe(true);
	});

	it('parses --mcp-project-create=false and --mcp-project-tests=false', async () => {
		const args = parseCliArgs(
			['--mcp-project-create=false', '--mcp-project-tests=false'],
			'/cwd',
		);
		expect(args.mcpProjectCreate).toBe(false);
		expect(args.mcpProjectTests).toBe(false);
	});

	it('parses --plugins as a comma list and overrides dirs', async () => {
		const args = parseCliArgs(
			['--plugins=proposals,pepegrillo', '--cacheDir=.x', '--docsDir=d'],
			'/cwd',
		);
		expect(args.plugins).toEqual(['proposals', 'pepegrillo']);
		expect(args.cacheDir).toBe('.x');
		expect(args.docsDir).toBe('d');
	});

	it('supports --key value form and forwards unknown flags to extra', async () => {
		const args = parseCliArgs(
			['--workspace', '/ws', '--proposalsDir', 'docs/p'],
			'/cwd',
		);
		expect(args.workspace).toBe('/ws');
		expect(args.extra.proposalsDir).toBe('docs/p');
	});

	// N18: plugin presets
	it('expands --preset=swarm into its plugin set', async () => {
		const args = parseCliArgs(['--preset=swarm'], '/cwd');
		expect(args.plugins).toEqual([...resolvePreset('swarm')]);
		expect(args.plugins).toContain('proposals');
		expect(args.plugins).toContain('deps');
		// `preset` is a known key, not forwarded to extra
		expect(args.extra.preset).toBeUndefined();
	});

	it('merges --preset with explicit --plugins, de-duped, preset first', async () => {
		const args = parseCliArgs(
			['--preset=minimal', '--plugins=memory,git'],
			'/cwd',
		);
		// minimal = [git, search]; + memory (git de-duped)
		expect(args.plugins).toEqual(['git', 'search', 'memory']);
	});

	it('ignores an unknown preset', async () => {
		expect(parseCliArgs(['--preset=nope'], '/cwd').plugins).toEqual([]);
		expect(resolvePreset('nope')).toEqual([]);
		expect(resolvePreset(undefined)).toEqual([]);
	});

	// --exclude-plugins: subtract a plugin (or several) from the resolved set
	it('subtracts --exclude-plugins from a preset (single)', async () => {
		const args = parseCliArgs(
			['--preset=swarm', '--exclude-plugins=notification'],
			'/cwd',
		);
		expect(args.plugins).toContain('proposals');
		expect(args.plugins).toContain('status-marker');
		expect(args.plugins).not.toContain('notification');
		expect(args.excludePlugins).toEqual(['notification']);
	});

	it('subtracts --exclude-plugins from a preset (comma list)', async () => {
		const args = parseCliArgs(
			['--preset=swarm', '--exclude-plugins=notification,quality'],
			'/cwd',
		);
		expect(args.plugins).not.toContain('notification');
		expect(args.plugins).not.toContain('quality');
		expect(args.plugins).toContain('status-marker');
	});

	it('accepts the camelCase alias --excludePlugins', async () => {
		const args = parseCliArgs(
			['--preset=swarm', '--excludePlugins=notification'],
			'/cwd',
		);
		expect(args.plugins).not.toContain('notification');
		expect(args.excludePlugins).toEqual(['notification']);
	});

	it('subtracts an explicit --plugins entry', async () => {
		const args = parseCliArgs(
			[
				'--plugins=git,search,status-marker',
				'--exclude-plugins=status-marker',
			],
			'/cwd',
		);
		expect(args.plugins).toEqual(['git', 'search']);
	});

	it('swarm preset now includes status-marker (close-marker convention)', async () => {
		const args = parseCliArgs(['--preset=swarm'], '/cwd');
		expect(args.plugins).toContain('status-marker');
	});

	// f00052 S2 — host-scoped --agent-worktree gate (tri-state, default off)
	describe('--agent-worktree', () => {
		it('defaults to undefined when the flag is absent (falls back to false downstream)', () => {
			const args = parseCliArgs([], '/cwd');
			expect(args.agentWorktree).toBeUndefined();
		});

		it('parses --agent-worktree=true', () => {
			const args = parseCliArgs(['--agent-worktree=true'], '/cwd');
			expect(args.agentWorktree).toBe(true);
		});

		it('parses --agent-worktree=false', () => {
			const args = parseCliArgs(['--agent-worktree=false'], '/cwd');
			expect(args.agentWorktree).toBe(false);
		});

		it('treats a bare --agent-worktree as true', () => {
			const args = parseCliArgs(['--agent-worktree'], '/cwd');
			expect(args.agentWorktree).toBe(true);
		});

		it('throws a clear parse error for an unknown value, not a silent false', () => {
			expect(() =>
				parseCliArgs(['--agent-worktree=maybe'], '/cwd'),
			).toThrow(/Invalid value for --agent-worktree: "maybe"/);
		});
	});
});
