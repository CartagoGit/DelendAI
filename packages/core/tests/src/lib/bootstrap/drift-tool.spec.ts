import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBootstrapToolRegistrations } from '@mcp-vertex/core/lib/bootstrap/bootstrap-tool';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';

const callTool = async (
	tool: IToolRegistration,
	args: unknown = {},
): Promise<{ content: Array<{ text: string }> }> => {
	let handler: (a: unknown) => Promise<{
		content: Array<{ text: string }>;
	}>;
	await tool.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	return handler!(args);
};

describe('drift_check tool', async () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'mcp-vertex-drift-tool-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const writePkg = (pkg: Record<string, unknown>) => {
		writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
	};

	it('returns isFirstSnapshot=true on the first call', async () => {
		writePkg({ name: 'svc' });
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider(root),
			namespacePrefix: 'app',
			cacheDir: '.cache/mcp-vertex',
		});
		const drift = tools.find((t) => t.id === 'drift_check');
		expect(drift).toBeDefined();
		const result = await callTool(drift!);
		const parsed = JSON.parse(result.content[0]?.text ?? '{}');
		expect(parsed.isFirstSnapshot).toBe(true);
		expect(parsed.hasDrift).toBe(true);
		expect(parsed.summary).toMatch(/First snapshot/i);
	});

	it('reports no drift on the second call (snapshot persisted)', async () => {
		writePkg({ name: 'svc' });
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider(root),
			namespacePrefix: 'app',
			cacheDir: '.cache/mcp-vertex',
		});
		const drift = tools.find((t) => t.id === 'drift_check')!;
		await callTool(drift); // first call persists
		const second = await callTool(drift);
		const parsed = JSON.parse(second.content[0]?.text ?? '{}');
		expect(parsed.isFirstSnapshot).toBe(false);
		expect(parsed.hasDrift).toBe(false);
		expect(parsed.lastSnapshotAt).not.toBeNull();
	});

	it('flags a new script on the third call after a project change', async () => {
		writePkg({ name: 'svc', scripts: { test: 'vitest' } });
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider(root),
			namespacePrefix: 'app',
			cacheDir: '.cache/mcp-vertex',
		});
		const drift = tools.find((t) => t.id === 'drift_check')!;
		await callTool(drift); // baseline
		// Project grows: a new `e2e` script.
		writePkg({
			name: 'svc',
			scripts: { test: 'vitest', e2e: 'playwright' },
		});
		const third = await callTool(drift);
		const parsed = JSON.parse(third.content[0]?.text ?? '{}');
		expect(parsed.hasDrift).toBe(true);
		const scriptAdd = parsed.changes.find(
			(c: { kind: string }) => c.kind === 'script-added',
		);
		expect(scriptAdd).toBeDefined();
		expect(scriptAdd.summary).toContain('e2e');
	});

	it('does not persist when persist=false is passed', async () => {
		writePkg({ name: 'svc' });
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider(root),
			namespacePrefix: 'app',
			cacheDir: '.cache/mcp-vertex',
		});
		const drift = tools.find((t) => t.id === 'drift_check')!;
		await callTool(drift, { persist: false });
		await callTool(drift, { persist: false });
		// Both calls see no baseline → isFirstSnapshot=true on both.
		const peek = await callTool(drift, { persist: false });
		const parsed = JSON.parse(peek.content[0]?.text ?? '{}');
		expect(parsed.isFirstSnapshot).toBe(true);
	});

	it('the new tool is exposed by buildBootstrapToolRegistrations', async () => {
		const tools = buildBootstrapToolRegistrations({
			workspace: createWorkspacePathProvider(root),
			namespacePrefix: 'app',
			cacheDir: '.cache/mcp-vertex',
		});
		const ids = tools.map((t) => t.id);
		expect(ids).toContain('drift_check');
	});
});
