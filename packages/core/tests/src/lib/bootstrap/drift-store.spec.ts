import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DRIFT_STORE_VERSION,
	loadDriftSnapshot,
	saveDriftSnapshot,
} from '@mcp-vertex/core/lib/bootstrap/drift-store';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';

describe('drift-store', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'mcp-vertex-drift-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns undefined on the first call (file does not exist)', async () => {
		const result = await loadDriftSnapshot(
			createWorkspacePathProvider(root),
			'.cache/mcp-vertex',
		);
		expect(result.snapshot).toBeUndefined();
		expect(result.corruptBackupPath).toBeNull();
	});

	it('round-trips a saved snapshot', async () => {
		const workspace = createWorkspacePathProvider(root);
		const analysis = {
			hasPackageJson: true,
			name: 'acme',
			projectType: 'library' as const,
			language: 'typescript' as const,
			packageManager: 'bun' as const,
			framework: undefined,
			testRunner: 'vitest' as const,
			monorepoTool: undefined,
			hasMcpProject: false,
			mcpEvidence: [],
			ci: [],
			agentConfigs: [],
			scripts: { test: 'vitest' },
			signals: [],
		};
		await saveDriftSnapshot(workspace, '.cache/mcp-vertex', analysis);
		const result = await loadDriftSnapshot(workspace, '.cache/mcp-vertex');
		expect(result.snapshot).toBeDefined();
		expect(result.snapshot?.version).toBe(DRIFT_STORE_VERSION);
		expect(result.snapshot?.analysis.name).toBe('acme');
		expect(result.snapshot?.analysis.scripts.test).toBe('vitest');
	});

	it('quarantines a corrupt snapshot and returns undefined', async () => {
		const workspace = createWorkspacePathProvider(root);
		const target = workspace.resolve(
			'.cache/mcp-vertex/drift/last-analysis.json',
		);
		mkdirSync(join(root, '.cache/mcp-vertex/drift'), { recursive: true });
		writeFileSync(target, '{ not valid json', 'utf8');
		const result = await loadDriftSnapshot(workspace, '.cache/mcp-vertex');
		expect(result.snapshot).toBeUndefined();
		expect(result.corruptBackupPath).not.toBeNull();
		// The corrupt file is preserved (not silently deleted).
		expect(existsSync(result.corruptBackupPath ?? '')).toBe(true);
		// Subsequent load returns undefined with no new backup.
		const result2 = await loadDriftSnapshot(workspace, '.cache/mcp-vertex');
		expect(result2.snapshot).toBeUndefined();
	});

	it('round-trip is atomic (no torn writes under concurrent saves)', async () => {
		const workspace = createWorkspacePathProvider(root);
		const mk = (i: number) => ({
			hasPackageJson: true,
			name: `pkg-${i}`,
			projectType: 'library' as const,
			language: 'typescript' as const,
			packageManager: 'bun' as const,
			framework: undefined,
			testRunner: 'vitest' as const,
			monorepoTool: undefined,
			hasMcpProject: false,
			mcpEvidence: [],
			ci: [],
			agentConfigs: [],
			scripts: {},
			signals: [],
		});
		// Fire 5 saves in parallel — the mutex serialises them and the
		// final file must be one of the saved payloads (not a mix).
		await Promise.all(
			[0, 1, 2, 3, 4].map((i) =>
				saveDriftSnapshot(workspace, '.cache/mcp-vertex', mk(i)),
			),
		);
		const result = await loadDriftSnapshot(workspace, '.cache/mcp-vertex');
		expect(result.snapshot).toBeDefined();
		const raw = readFileSync(
			workspace.resolve('.cache/mcp-vertex/drift/last-analysis.json'),
			'utf8',
		);
		// Valid JSON, not truncated.
		expect(() => JSON.parse(raw)).not.toThrow();
		// Final payload name matches one of the saved indices.
		expect(result.snapshot?.analysis.name).toMatch(/^pkg-\d$/);
	});
});
