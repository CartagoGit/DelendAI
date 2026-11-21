import { describe, expect, it } from 'vitest';

import { RUNTIME_STATE_ENV } from '@delendai/core/lib/contracts/constants/runtime-state.constant';
import {
	describeRuntimeState,
	readRuntimeState,
} from '@delendai/core/lib/startup-report/runtime-state.helper';

describe('the runtime state [<50ms]', () => {
	const branch = {
		kind: 'branch',
		branch: 'develop',
		sha12: 'abcdef123456',
		ahead: 0,
		behind: 0,
		dirty: false,
	} as const;

	it('says a tag by its name', () => {
		expect(
			describeRuntimeState({
				kind: 'tag',
				tag: 'v0.3.0',
				ahead: 0,
				behind: 0,
				dirty: false,
			}),
		).toBe('tag v0.3.0');
	});

	it('says a branch at its commit, level with origin', () => {
		expect(describeRuntimeState(branch)).toBe(
			'develop@abcdef123456 level with origin/develop',
		);
	});

	it('says ahead, behind and dirty', () => {
		expect(
			describeRuntimeState({
				...branch,
				ahead: 2,
				behind: 3,
				dirty: true,
			}),
		).toBe('develop@abcdef123456 ahead 2, behind 3, dirty');
	});

	it('reads the host state from the environment, ignoring junk', () => {
		expect(
			readRuntimeState({
				[RUNTIME_STATE_ENV]: JSON.stringify(branch),
			}),
		).toEqual(branch);
		expect(readRuntimeState({ [RUNTIME_STATE_ENV]: '{nope' })).toBe(
			undefined,
		);
		expect(readRuntimeState({})).toBe(undefined);
	});
});
