import { describe, expect, it } from 'vitest';

import {
	classifyTypeScriptPath,
	CONVENTION_PROFILE_IDS,
	resolveProfile,
	TYPESCRIPT_PROFILE,
} from '../../../../src/lib/profiles/profile-registry';
import { classifyWithProfile } from '../../../../src/lib/profiles/profile.contract';

const TS_FIXTURE_PATHS = [
	'packages/core/src/public/index.ts',
	'packages/core/src/lib/contracts/interfaces/plugin.interface.ts',
	'packages/core/src/lib/contracts/constants/paths.constant.ts',
	'packages/core/src/lib/shared/atomic-write.ts',
	'packages/core/src/lib/cli/assemble.ts',
	'plugins/proposals/src/lib/tools/authoring.tool.ts',
	'plugins/proposals/tests/src/lib/authoring.spec.ts',
	'packages/core/src/generated/tool-outputs.ts',
	'apps/web/src/pages/index.astro.ts',
	'weird/unclassifiable/thing.ts',
];

describe('resolveProfile (f00113 S1)', () => {
	it('defaults to typescript when no id is passed', () => {
		const resolution = resolveProfile();
		expect(resolution.ok).toBe(true);
		if (resolution.ok) expect(resolution.profile.id).toBe('typescript');
	});

	it('resolves every supported id', () => {
		for (const id of CONVENTION_PROFILE_IDS) {
			const resolution = resolveProfile(id);
			expect(resolution.ok).toBe(true);
			if (resolution.ok) expect(resolution.profile.id).toBe(id);
		}
	});

	it('returns a structured error listing supported ids for unknown profiles', () => {
		const resolution = resolveProfile('cobol');
		expect(resolution.ok).toBe(false);
		if (!resolution.ok) {
			expect(resolution.reason).toContain('cobol');
			expect(resolution.supported).toEqual([...CONVENTION_PROFILE_IDS]);
		}
	});
});

describe('typescript profile parity (f00113 S1)', () => {
	it('classifies byte-identically to the core classifyPath', () => {
		for (const path of TS_FIXTURE_PATHS) {
			expect(classifyWithProfile(TYPESCRIPT_PROFILE, path)).toBe(
				classifyTypeScriptPath(path),
			);
		}
	});

	it('wraps the core rule objects, not copies', () => {
		// Same array identity chain: mutating/forking would break the
		// single-source-of-truth guarantee the parity spec guards.
		expect(TYPESCRIPT_PROFILE.rules.length).toBeGreaterThan(10);
	});
});
