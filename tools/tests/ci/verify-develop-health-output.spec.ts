import { describe, expect, it } from 'vitest';

import { resolveOutputPath } from '../../scripts/ci/verify-develop-health.script.ts';

describe('resolveOutputPath', () => {
	it('[<100ms] keeps relative paths inside the workspace', () => {
		expect(resolveOutputPath('out/h.json', '/ws')).toBe('/ws/out/h.json');
		expect(resolveOutputPath('../h.json', '/ws')).toBeUndefined();
		expect(resolveOutputPath('a/../../h.json', '/ws')).toBeUndefined();
	});

	it('[<100ms] accepts an explicit absolute json path and refuses the rest', () => {
		expect(resolveOutputPath('/tmp/h.json', '/ws')).toBe('/tmp/h.json');
		expect(resolveOutputPath('/etc/passwd', '/ws')).toBeUndefined();
		expect(resolveOutputPath('h.json\0.txt', '/ws')).toBeUndefined();
		expect(resolveOutputPath('', '/ws')).toBeUndefined();
	});
});
