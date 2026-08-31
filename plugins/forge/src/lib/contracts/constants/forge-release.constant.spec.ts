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
				id: '123',
				name: 'v0.2.0',
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

	// MUY-ALTA #2: the service returns `name` (matching `IForgeReleaseSuccess`
	// and `gh release view --json name`). Earlier revisions named the slot
	// `title`, making `toolJsonBounded` reject real forge responses. This
	// test pins that the result schema accepts the service's actual output.
	it('accepts the service-shaped success envelope (name)', () => {
		const result = FORGE_RELEASE_OUTPUT_SCHEMA.safeParse({
			ok: true,
			provider: 'github',
			tag: 'v0.2.0',
			url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.2.0',
			id: '123',
			name: 'v0.2.0',
			draft: false,
			prerelease: false,
		});
		expect(result.success).toBe(true);
		if (result.success && result.data.ok) {
			expect(result.data.id).toBe('123');
		}
	});

	// Back-compat: legacy hosts reading `result.title` keep working because
	// the schema transform populates `title` from `name` when missing.
	it('mirrors name into title for back-compat readers', () => {
		const result = FORGE_RELEASE_OUTPUT_SCHEMA.safeParse({
			ok: true,
			provider: 'github',
			tag: 'v0.2.0',
			url: 'https://example/r',
			name: 'v0.2.0',
		});
		expect(result.success).toBe(true);
		if (result.success && result.data.ok) {
			expect(result.data.title).toBe('v0.2.0');
		}
	});

	// MUY-ALTA #1 (input): all 7 documented input fields pass.
	it('accepts every documented input field', () => {
		const result = FORGE_RELEASE_INPUT_SCHEMA.safeParse({
			tag: 'v1.0.0',
			notes: 'hello',
			notesFile: 'CHANGELOG.md',
			target: 'main',
			prerelease: true,
			draft: true,
			confirm: true,
		});
		// mutual exclusion: notes + notesFile is illegal; this is enforced
		// in the handler, not the schema. Schema permits both at parse time.
		expect(result.success).toBe(true);
	});
});
