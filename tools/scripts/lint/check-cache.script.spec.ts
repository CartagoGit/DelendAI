#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findStrayCacheDirs } from './check-cache.script.ts';

describe('findStrayCacheDirs (f00065 S2)', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'check-cache-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns [] when only the canonical root .cache exists', async () => {
		mkdirSync(join(root, '.cache', 'mcp-vertex'), { recursive: true });
		writeFileSync(join(root, '.cache', 'mcp-vertex', 'state.json'), '{}');
		expect(await findStrayCacheDirs(root)).toEqual([]);
	});

	it('flags a per-folder .cache outside the root', async () => {
		mkdirSync(join(root, '.cache'), { recursive: true });
		mkdirSync(join(root, 'tools', 'scripts', '.cache', 'mcp-vertex'), {
			recursive: true,
		});
		expect(await findStrayCacheDirs(root)).toEqual([
			join('tools', 'scripts', '.cache'),
		]);
	});

	it('flags multiple stray caches, sorted, without descending into them', async () => {
		mkdirSync(join(root, 'apps', 'web', '.cache', 'astro'), {
			recursive: true,
		});
		mkdirSync(join(root, 'plugins', 'rules', '.cache', 'rules'), {
			recursive: true,
		});
		expect(await findStrayCacheDirs(root)).toEqual([
			join('apps', 'web', '.cache'),
			join('plugins', 'rules', '.cache'),
		]);
	});

	it('skips node_modules and .git when scanning', async () => {
		mkdirSync(join(root, 'node_modules', 'pkg', '.cache'), {
			recursive: true,
		});
		mkdirSync(join(root, '.git', '.cache'), { recursive: true });
		expect(await findStrayCacheDirs(root)).toEqual([]);
	});

	it('returns [] for a tree with no .cache at all', async () => {
		mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true });
		expect(await findStrayCacheDirs(root)).toEqual([]);
	});
});
