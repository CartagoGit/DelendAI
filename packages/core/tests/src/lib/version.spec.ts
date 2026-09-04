import { describe, expect, it } from 'vitest';

import corePackageJson from '../../../package.json';
import { MCP_VERTEX_VERSION } from '../../../src/version';

describe('MCP_VERTEX_VERSION', () => {
	it('matches the published @delendai/core package.json version', () => {
		expect(MCP_VERTEX_VERSION).toBe(corePackageJson.version);
	});

	it('is a semver string', () => {
		expect(MCP_VERTEX_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
	});
});
