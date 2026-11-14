import { describe, expect, it } from 'vitest';

import { hasRelease, installLines } from './readme-install-truth.script';

describe('readme-install-truth', () => {
	it('flags install commands naming an @delendai package', () => {
		const text = [
			'bunx --package @delendai/cli delendai overview',
			'npm install @delendai/core',
			'"args": ["--package", "@delendai/cli", "x"]',
		].join('\n');
		expect(installLines('R.md', text)).toEqual([
			'R.md:1',
			'R.md:2',
			'R.md:3',
		]);
	});

	it('leaves prose and checkout commands alone', () => {
		const text = [
			'`@delendai/cli` has not been released yet',
			'bun run cli:link',
			'| `plugins/git` | `@delendai/git` | Git. |',
		].join('\n');
		expect(installLines('R.md', text)).toEqual([]);
	});

	it('reads a release from vX.Y.Z tags only', () => {
		expect(hasRelease(['v0.1.0'])).toBe(true);
		expect(hasRelease(['archive/x', 'vnext'])).toBe(false);
		expect(hasRelease([])).toBe(false);
	});
});
