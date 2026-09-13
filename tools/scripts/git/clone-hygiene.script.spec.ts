/**
 * The clone was accumulating remote-tracking refs for branches the forge
 * had already deleted. These cases pin the two decisions that fix it and
 * keep it safe.
 */
import { describe, expect, it } from 'vitest';

import { CLONE_SETTINGS, settingsToApply } from './clone-hygiene.script';

describe('settingsToApply', () => {
	it('changes nothing when the clone already agrees', () => {
		// `prepare` runs on every install. A setup step that rewrites
		// config it did not need to touch is noise in every log.
		const current = (key: string) =>
			CLONE_SETTINGS.find((s) => s.key === key)?.value;
		expect(settingsToApply(CLONE_SETTINGS, current)).toEqual([]);
	});

	it('corrects a setting somebody turned off', () => {
		const current = (key: string) =>
			key === 'fetch.prune' ? 'false' : undefined;
		expect(
			settingsToApply(CLONE_SETTINGS, current).map((s) => s.key),
		).toContain('fetch.prune');
	});
});

describe('what this repository asks of a clone', () => {
	it('prunes branches but never tags', () => {
		// A deleted branch is cleanup. A deleted tag is a release
		// somebody withdrew — mirroring that automatically would erase
		// the local record of a decision without anybody asking.
		const setting = (key: string) =>
			CLONE_SETTINGS.find((s) => s.key === key)?.value;
		expect(setting('fetch.prune')).toBe('true');
		expect(setting('fetch.pruneTags')).toBe('false');
	});

	it('gives every setting the failure it prevents', () => {
		// A config line with no stated reason is one nobody dares remove.
		for (const setting of CLONE_SETTINGS) {
			expect(setting.because.length).toBeGreaterThan(30);
		}
	});
});
