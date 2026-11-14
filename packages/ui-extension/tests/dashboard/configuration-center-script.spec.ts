import { describe, expect, it } from 'vitest';

import { configurationCenterScript } from '../../src/configuration-center/configuration-center-script';

describe('configuration centre script (UI-CFG01)', () => {
	it('clears only the edits the acknowledged request saved', () => {
		const script = configurationCenterScript();
		expect(() => new Function(script)).not.toThrow();
		expect(script).toContain('submitted = new Map(edits)');
		expect(script).toContain(
			'if (edits.get(key) === edit) edits.delete(key)',
		);
		expect(script).not.toContain('edits.clear()');
	});
});
