import { describe, expect, it } from 'vitest';

import {
	FORGE_RELEASE_INPUT_SCHEMA,
	FORGE_RELEASE_OUTPUT_SCHEMA,
} from './forge-release.constant';

describe('forge release schemas', () => {
	it('accepts a valid release input', () => {
		expect(
			FORGE_RELEASE_INPUT_SCHEMA.safeParse({
				tag: 'v0.2.0',
				notes: 'Release notes',
				confirm: true,
			}).success,
		).toBe(true);
	});

	it('accepts a release success envelope', () => {
		expect(
			FORGE_RELEASE_OUTPUT_SCHEMA.safeParse({
				ok: true,
				provider: 'github',
				tag: 'v0.2.0',
				url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.2.0',
			}).success,
		).toBe(true);
	});

	it('releases require confirm:true', () => {
		expect(
			FORGE_RELEASE_INPUT_SCHEMA.safeParse({
				tag: 'v0.2.0',
				confirm: false,
			}).success,
		).toBe(false);
		expect(
			FORGE_RELEASE_INPUT_SCHEMA.safeParse({
				tag: 'v0.2.0',
			}).success,
		).toBe(false);
	});

	it('keeps the release input strict', () => {
		expect(
			FORGE_RELEASE_INPUT_SCHEMA.safeParse({
				tag: 'v0.2.0',
				confirm: true,
				extra: true,
			}).success,
		).toBe(false);
	});

	it('accepts a failure envelope', () => {
		expect(
			FORGE_RELEASE_OUTPUT_SCHEMA.safeParse({
				ok: false,
				provider: 'github',
				error: { reason: 'release failed' },
			}).success,
		).toBe(true);
	});
});
