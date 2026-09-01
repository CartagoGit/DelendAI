import { describe, expect, it } from 'vitest';

import { resolveBumpCoreVersion } from './release.script';

describe('resolveBumpCoreVersion (f00152 S7)', () => {
	describe('sentinel / absent pin', () => {
		it('returns the config unchanged when coreVersion is undefined', () => {
			const current: { coreVersion?: string } = {};
			const next = resolveBumpCoreVersion(current, '0.5.0');
			expect(next).toBe(current);
		});

		it('returns the config unchanged when coreVersion is "latest-published"', () => {
			const current = { coreVersion: 'latest-published' };
			const next = resolveBumpCoreVersion(current, '0.5.0');
			expect(next).toBe(current);
		});
	});

	describe('concrete semver pin', () => {
		it('bumps the pin to the new version', () => {
			const next = resolveBumpCoreVersion(
				{ coreVersion: '0.1.0' },
				'0.2.0',
			);
			expect(next.coreVersion).toBe('0.2.0');
		});

		it('does not mutate the input config (pure)', () => {
			const original = { coreVersion: '0.1.0' };
			resolveBumpCoreVersion(original, '0.2.0');
			expect(original.coreVersion).toBe('0.1.0');
		});

		it('bumps the pin even when newVersion equals the current pin', () => {
			// Same version → still a bump from the caller's POV (idempotent
			// at the wire level; the file-write wrapper skips the no-op).
			const next = resolveBumpCoreVersion(
				{ coreVersion: '0.1.0' },
				'0.1.0',
			);
			expect(next.coreVersion).toBe('0.1.0');
			expect(next).not.toBe({ coreVersion: '0.1.0' });
		});
	});

	describe('structural identity', () => {
		it('preserves all other fields in the config', () => {
			const current = {
				coreVersion: '0.1.0',
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
				plugins: { foo: { enabled: true } },
			};
			const next = resolveBumpCoreVersion(current, '0.2.0');
			expect(next.cacheDir).toBe('.cache/mcp-vertex');
			expect(next.docsDir).toBe('docs/mcp-vertex');
			expect(next.plugins).toEqual({ foo: { enabled: true } });
			expect(next.coreVersion).toBe('0.2.0');
		});
	});
});
