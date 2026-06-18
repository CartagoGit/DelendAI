import { describe, expect, it } from 'vitest';

import {
	parseCliArgs,
	resolvePreset,
} from '@mcp-vertex/core/lib/plugins/parse-cli-args';

describe('parseCliArgs', () => {
	it('applies defaults when nothing is passed', () => {
		const args = parseCliArgs([], '/cwd');
		expect(args.plugins).toEqual([]);
		expect(args.cacheDir).toBe('.cache/mcp-vertex');
		expect(args.docsDir).toBe('docs/mcp-vertex');
		expect(args.workspace).toBe('/cwd');
		expect(args.mcpProjectCreate).toBe(true);
		expect(args.mcpProjectTests).toBe(true);
	});

	it('parses --mcp-project-create=false and --mcp-project-tests=false', () => {
		const args = parseCliArgs(
			['--mcp-project-create=false', '--mcp-project-tests=false'],
			'/cwd',
		);
		expect(args.mcpProjectCreate).toBe(false);
		expect(args.mcpProjectTests).toBe(false);
	});

	it('parses --plugins as a comma list and overrides dirs', () => {
		const args = parseCliArgs(
			['--plugins=proposals,pepegrillo', '--cacheDir=.x', '--docsDir=d'],
			'/cwd',
		);
		expect(args.plugins).toEqual(['proposals', 'pepegrillo']);
		expect(args.cacheDir).toBe('.x');
		expect(args.docsDir).toBe('d');
	});

	it('supports --key value form and forwards unknown flags to extra', () => {
		const args = parseCliArgs(
			['--workspace', '/ws', '--proposalsDir', 'docs/p'],
			'/cwd',
		);
		expect(args.workspace).toBe('/ws');
		expect(args.extra.proposalsDir).toBe('docs/p');
	});

	// N18: plugin presets
	it('expands --preset=swarm into its plugin set', () => {
		const args = parseCliArgs(['--preset=swarm'], '/cwd');
		expect(args.plugins).toEqual([...resolvePreset('swarm')]);
		expect(args.plugins).toContain('proposals');
		expect(args.plugins).toContain('deps');
		// `preset` is a known key, not forwarded to extra
		expect(args.extra.preset).toBeUndefined();
	});

	it('merges --preset with explicit --plugins, de-duped, preset first', () => {
		const args = parseCliArgs(
			['--preset=minimal', '--plugins=memory,git'],
			'/cwd',
		);
		// minimal = [git, search]; + memory (git de-duped)
		expect(args.plugins).toEqual(['git', 'search', 'memory']);
	});

	it('ignores an unknown preset', () => {
		expect(parseCliArgs(['--preset=nope'], '/cwd').plugins).toEqual([]);
		expect(resolvePreset('nope')).toEqual([]);
		expect(resolvePreset(undefined)).toEqual([]);
	});

	// --exclude-plugins: subtract a plugin (or several) from the resolved set
	it('subtracts --exclude-plugins from a preset (single)', () => {
		const args = parseCliArgs(
			['--preset=swarm', '--exclude-plugins=notification'],
			'/cwd',
		);
		expect(args.plugins).toContain('proposals');
		expect(args.plugins).toContain('status-marker');
		expect(args.plugins).not.toContain('notification');
		expect(args.excludePlugins).toEqual(['notification']);
	});

	it('subtracts --exclude-plugins from a preset (comma list)', () => {
		const args = parseCliArgs(
			['--preset=swarm', '--exclude-plugins=notification,quality'],
			'/cwd',
		);
		expect(args.plugins).not.toContain('notification');
		expect(args.plugins).not.toContain('quality');
		expect(args.plugins).toContain('status-marker');
	});

	it('accepts the camelCase alias --excludePlugins', () => {
		const args = parseCliArgs(
			['--preset=swarm', '--excludePlugins=notification'],
			'/cwd',
		);
		expect(args.plugins).not.toContain('notification');
		expect(args.excludePlugins).toEqual(['notification']);
	});

	it('subtracts an explicit --plugins entry', () => {
		const args = parseCliArgs(
			[
				'--plugins=git,search,status-marker',
				'--exclude-plugins=status-marker',
			],
			'/cwd',
		);
		expect(args.plugins).toEqual(['git', 'search']);
	});

	it('swarm preset now includes status-marker (close-marker convention)', () => {
		const args = parseCliArgs(['--preset=swarm'], '/cwd');
		expect(args.plugins).toContain('status-marker');
	});
});
