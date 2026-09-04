import { describe, expect, it } from 'vitest';

import { mergeServerEntry } from '@delendai/core/public';

const ENTRY = {
	command: 'npx',
	args: ['-y', '@delendai/core', '--preset=standard'],
};

describe('mergeServerEntry (M39) — never clobbers the user’s config', async () => {
	it('creates the file shape when none exists', async () => {
		const r = mergeServerEntry(null, 'mcpServers', 'delendai', ENTRY);
		expect(r.action).toBe('created');
		expect(JSON.parse(r.json)).toEqual({
			mcpServers: { delendai: ENTRY },
		});
	});

	it('ADDS our server while preserving existing servers and other keys', async () => {
		const existing = JSON.stringify({
			mcpServers: { other: { command: 'node', args: ['x.js'] } },
			someOtherSetting: { a: 1 },
		});
		const r = mergeServerEntry(existing, 'mcpServers', 'delendai', ENTRY);
		expect(r.action).toBe('added');
		const out = JSON.parse(r.json);
		expect(out.mcpServers.other).toEqual({
			command: 'node',
			args: ['x.js'],
		}); // untouched
		expect(out.mcpServers['delendai']).toEqual(ENTRY);
		expect(out.someOtherSetting).toEqual({ a: 1 }); // untouched
	});

	it('updates our entry but leaves siblings intact', async () => {
		const existing = JSON.stringify({
			mcpServers: {
				delendai: { command: 'bunx', args: ['old'] },
				peer: { command: 'p' },
			},
		});
		const r = mergeServerEntry(existing, 'mcpServers', 'delendai', ENTRY);
		expect(r.action).toBe('updated');
		const out = JSON.parse(r.json);
		expect(out.mcpServers['delendai']).toEqual(ENTRY);
		expect(out.mcpServers.peer).toEqual({ command: 'p' });
	});

	it('is idempotent: re-running with the same entry reports unchanged', async () => {
		const first = mergeServerEntry(null, 'servers', 'delendai', ENTRY).json;
		const r = mergeServerEntry(first, 'servers', 'delendai', ENTRY);
		expect(r.action).toBe('unchanged');
		expect(JSON.parse(r.json).servers['delendai']).toEqual(ENTRY);
	});

	it('honours the IDE-specific top-level key (VS Code `servers`)', async () => {
		const r = mergeServerEntry(null, 'servers', 'delendai', {
			type: 'stdio',
			...ENTRY,
		});
		expect(JSON.parse(r.json).servers['delendai'].type).toBe('stdio');
	});
});
