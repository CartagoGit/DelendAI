/**
 * no-network.spec.ts — the plugin answers from files; nothing in it can
 * reach the network. A future per-framework adapter with an allow-list
 * would be its own proposal, and would have to change this spec.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(import.meta.dirname, '../../src');

const NETWORK_MODULE =
	/from\s+['"](?:node:)?(?:https?|http2|net|tls|dgram|dns|undici|ws)['"]/u;
const NETWORK_CALL = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/u;

const sourceFiles = async (dir: string): Promise<readonly string[]> => {
	const found: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await sourceFiles(path)));
		else if (entry.name.endsWith('.ts')) found.push(path);
	}
	return found;
};

describe('the framework-knowledge plugin', () => {
	it('imports no network module and calls no network API', async () => {
		const files = await sourceFiles(SOURCE_ROOT);
		expect(files.length).toBeGreaterThan(0);
		const offenders: string[] = [];
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			if (NETWORK_MODULE.test(text) || NETWORK_CALL.test(text)) {
				offenders.push(file.slice(SOURCE_ROOT.length + 1));
			}
		}
		expect(offenders).toEqual([]);
	});
});
