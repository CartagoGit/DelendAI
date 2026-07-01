import { resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';

describe('createWorkspacePathProvider', async () => {
	it('resolves workspace-relative paths against the absolute root', async () => {
		const provider = createWorkspacePathProvider('/tmp/spec-root');
		expect(provider.resolve('.cache/agents.lock.json')).toBe(
			resolve('/tmp/spec-root', '.cache/agents.lock.json'),
		);
	});

	it('normalises the root to an absolute path', async () => {
		const provider = createWorkspacePathProvider('relative-root');
		expect(provider.root.startsWith(sep)).toBe(true);
		expect(provider.root.endsWith('relative-root')).toBe(true);
	});

	it('returns absolute inputs unchanged', async () => {
		const provider = createWorkspacePathProvider('/tmp/spec-root');
		expect(provider.resolve('/already/absolute')).toBe('/already/absolute');
	});

	it('memoises repeated resolutions', async () => {
		const provider = createWorkspacePathProvider('/tmp/spec-root');
		const first = provider.resolve('docs/mcp-vertex/proposals/index.json');
		const second = provider.resolve('docs/mcp-vertex/proposals/index.json');
		expect(second).toBe(first);
	});
});
