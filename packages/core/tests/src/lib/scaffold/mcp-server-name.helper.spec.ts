import { describe, expect, it } from 'vitest';

import { hostToolSetReference } from '../../../../src/lib/scaffold/mcp-server-name.helper';

describe('hostToolSetReference', () => {
	it.each([
		['delendai', 'delendai'],
		['DelendAI', 'delendai'],
		['MCP-Project-Acme', 'mcp-project-acme'],
		['My  Project\tMCP', 'my-project-mcp'],
	])('refers to %s as %s, the way the host does', (name, reference) => {
		expect(hostToolSetReference(name)).toBe(reference);
	});
});
