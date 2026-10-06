import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';

import plugin from '../../src/index';

const contextAt = (
	root: string,
	options: Record<string, unknown>,
): IMcpPluginContext => ({
	workspace: { root, resolve: (p: string) => join(root, p) },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/completion',
	pluginDocsDir: 'docs/delendai/completion',
	namespacePrefix: 'completion',
	options,
	args: {},
});

describe('completion plugin — recordsDir containment at register', () => {
	let root = '';
	let outside = '';
	beforeEach(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), 'completion-ws-')));
		outside = realpathSync(mkdtempSync(join(tmpdir(), 'completion-out-')));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	});

	it('accepts the default records directory before it exists', () => {
		expect(() => plugin.register(contextAt(root, {}))).not.toThrow();
	});

	it('refuses a `..` escape', () => {
		expect(() =>
			plugin.register(contextAt(root, { recordsDir: '../records' })),
		).toThrow(/invalid recordsDir: path escapes workspace/);
	});

	it('refuses a recordsDir reached through a symlink out of the workspace', () => {
		symlinkSync(outside, join(root, 'link'), 'dir');
		expect(() =>
			plugin.register(contextAt(root, { recordsDir: 'link/records' })),
		).toThrow(/invalid recordsDir: path escapes workspace via symlink/);
	});
});
