import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MigrationError } from '@mcp-vertex/core/public';
import { createAgentRegistryStore } from '@mcp-vertex/proposals/lib/shared/agent-registry-store';

describe('agent-registry-store migrations', async () => {
	let dir = '';
	let path = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'agent-registry-'));
		path = join(dir, 'registry.json');
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('normalizes missing-version legacy data through the versioned migration runner', async () => {
		writeFileSync(
			path,
			JSON.stringify({
				assignments: [
					{
						task_id: 't1',
						agent_name: 'orion',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: '',
						adopted: false,
						assigned_at: '2026-06-21T00:00:00.000Z',
						last_seen: '2026-06-21T00:00:00.000Z',
						cooldown_until: null,
						status: 'active',
					},
				],
			}),
		);

		const registry = await createAgentRegistryStore(path).read();

		expect(registry.version).toBe(2);
		expect(registry.adopted).toEqual([]);
		expect(registry.assignments).toHaveLength(1);
	});

	it('refuses a newer registry version instead of silently normalizing it', async () => {
		writeFileSync(
			path,
			JSON.stringify({
				version: 100,
				adopted: [],
				assignments: [],
			}),
		);

		await expect(createAgentRegistryStore(path).read()).rejects.toThrow(
			MigrationError,
		);
		expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(100);
	});

	it('f00082 S2: v1→v2 migrator backfills host/model=null without destroying data', async () => {
		writeFileSync(
			path,
			JSON.stringify({
				version: 1,
				adopted: [],
				assignments: [
					{
						task_id: 't1',
						agent_name: 'orion',
						agent_slot: 'implementation_runner',
						parent_task_id: null,
						depth: 0,
						topic: 'legacy',
						adopted: false,
						assigned_at: '2026-06-21T00:00:00.000Z',
						last_seen: '2026-06-21T00:00:00.000Z',
						cooldown_until: null,
						status: 'active',
					},
				],
			}),
		);

		const registry = await createAgentRegistryStore(path).read();

		expect(registry.version).toBe(2);
		expect(registry.assignments).toHaveLength(1);
		const a = registry.assignments[0]!;
		expect(a.host).toBeNull();
		expect(a.model).toBeNull();
		// existing data survives the migration untouched
		expect(a.agent_name).toBe('orion');
		expect(a.topic).toBe('legacy');
	});

	it('f00082 S2: upsert persists host/model when a caller provides them', async () => {
		const store = createAgentRegistryStore(path);
		await store.upsert({
			task_id: 't2',
			agent_name: 'vela',
			agent_slot: 'implementation_runner',
			parent_task_id: null,
			depth: 0,
			topic: '',
			adopted: false,
			assigned_at: '2026-06-30T00:00:00.000Z',
			last_seen: '2026-06-30T00:00:00.000Z',
			cooldown_until: null,
			status: 'active',
			host: 'vscode-copilot',
			model: 'm3',
		});

		const registry = await store.read();
		const a = registry.assignments.find((x) => x.task_id === 't2')!;
		expect(a.host).toBe('vscode-copilot');
		expect(a.model).toBe('m3');
	});
});
