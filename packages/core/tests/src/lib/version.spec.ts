import { describe, expect, it } from 'vitest';

import corePackageJson from '../../../package.json';
import { DELENDAI_VERSION } from '../../../src/version';

describe('DELENDAI_VERSION', () => {
	it('matches the published @delendai/core package.json version', () => {
		expect(DELENDAI_VERSION).toBe(corePackageJson.version);
	});

	it('is a semver string', () => {
		expect(DELENDAI_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
	});
});
