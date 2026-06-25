/**
 * `IToolRegistration` contract guard.
 *
 * The optional `descriptionKey` field is the bridge that lets the docs site
 * (apps/web) render localised descriptions without changing the MCP SDK's
 * `description` contract (which must always be a string). This spec pins the
 * shape so a future refactor cannot silently drop the field — and so adding
 * a key to a registration does not require touching the runtime at all.
 */
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

// Minimal no-op `register` so the spec doesn't need a real McpServer.
const noopRegister = async (): Promise<void> => {};

describe('IToolRegistration', async () => {
	it('accepts a registration without descriptionKey (back-compat)', async () => {
		const reg: IToolRegistration = {
			id: 'ping',
			register: noopRegister,
		};
		expect(reg.descriptionKey).toBeUndefined();
	});

	it('accepts a registration with descriptionKey', async () => {
		const reg: IToolRegistration = {
			id: 'auto_work',
			descriptionKey: 'mcp-vertex_proposals_auto_work',
			register: noopRegister,
		};
		expect(reg.descriptionKey).toBe('mcp-vertex_proposals_auto_work');
	});

	it('preserves the i18n key convention (namespace_tool) via type-level guard', async () => {
		// The catalogue convention is `<namespace>_<tool>` (matches the MCP
		// tool name without the namespace prefix). This test pins the most
		// common shape so a renaming regression surfaces here.
		const proposalsKey = 'mcp-vertex_proposals_auto_work';
		expect(proposalsKey.split('_').length).toBeGreaterThanOrEqual(2);
		expect(proposalsKey.startsWith('proposals_')).toBe(true);
	});
});
