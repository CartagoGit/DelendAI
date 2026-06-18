import { describe, expect, it } from 'vitest';

import { mergeServerEntry } from '@mcp-vertex/core/public';

const ENTRY = {
	command: 'npx',
	args: ['-y', '@mcp-vertex/core', '--preset=standard'],
};

describe('mergeServerEntry (M39) — never clobbers the user’s config', () => {
	it('creates the file shape when none exists', () => {
		const r = mergeServerEntry(null, 'mcpServers', 'mcp-vertex', ENTRY);
		expect(r.action).toBe('created');
		expect(JSON.parse(r.json)).toEqual({
			mcpServers: { 'mcp-vertex': ENTRY },
		});
	});

	it('ADDS our server while preserving existing servers and other keys', () => {
		const existing = JSON.stringify({
			mcpServers: { other: { command: 'node', args: ['x.js'] } },
			someOtherSetting: { a: 1 },
		});
		const r = mergeServerEntry(existing, 'mcpServers', 'mcp-vertex', ENTRY);
		expect(r.action).toBe('added');
		const out = JSON.parse(r.json);
		expect(out.mcpServers.other).toEqual({
			command: 'node',
			args: ['x.js'],
		}); // untouched
		expect(out.mcpServers['mcp-vertex']).toEqual(ENTRY);
		expect(out.someOtherSetting).toEqual({ a: 1 }); // untouched
	});

	it('updates our entry but leaves siblings intact', () => {
		const existing = JSON.stringify({
			mcpServers: {
				'mcp-vertex': { command: 'bunx', args: ['old'] },
				peer: { command: 'p' },
			},
		});
		const r = mergeServerEntry(existing, 'mcpServers', 'mcp-vertex', ENTRY);
		expect(r.action).toBe('updated');
		const out = JSON.parse(r.json);
		expect(out.mcpServers['mcp-vertex']).toEqual(ENTRY);
		expect(out.mcpServers.peer).toEqual({ command: 'p' });
	});

	it('is idempotent: re-running with the same entry reports unchanged', () => {
		const first = mergeServerEntry(
			null,
			'servers',
			'mcp-vertex',
			ENTRY,
		).json;
		const r = mergeServerEntry(first, 'servers', 'mcp-vertex', ENTRY);
		expect(r.action).toBe('unchanged');
		expect(JSON.parse(r.json).servers['mcp-vertex']).toEqual(ENTRY);
	});

	it('honours the IDE-specific top-level key (VS Code `servers`)', () => {
		const r = mergeServerEntry(null, 'servers', 'mcp-vertex', {
			type: 'stdio',
			...ENTRY,
		});
		expect(JSON.parse(r.json).servers['mcp-vertex'].type).toBe('stdio');
	});
});
