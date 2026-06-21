import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MigrationError } from '@mcp-vertex/core/public';
import { createAgentRegistryStore } from '@mcp-vertex/proposals/lib/shared/agent-registry-store';

describe('agent-registry-store migrations', () => {
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

		expect(registry.version).toBe(1);
		expect(registry.adopted).toEqual([]);
		expect(registry.assignments).toHaveLength(1);
	});

	it('refuses a newer registry version instead of silently normalizing it', async () => {
		writeFileSync(
			path,
			JSON.stringify({
				version: 99,
				adopted: [],
				assignments: [],
			}),
		);

		await expect(createAgentRegistryStore(path).read()).rejects.toThrow(
			MigrationError,
		);
		expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(99);
	});
});
