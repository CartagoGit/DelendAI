import { describe, expect, it } from 'vitest';
import {
	ciEnvironmentMarker,
	isRunningInProjectCi,
} from '../../../../src/lib/work-identity/ci-environment.helper';

describe('ciEnvironmentMarker', () => {
	it('reads a provider variable on any forge', () => {
		expect(ciEnvironmentMarker({ GITLAB_CI: 'true' })).toBe('GITLAB_CI');
		expect(ciEnvironmentMarker({ GITHUB_ACTIONS: 'true' })).toBe(
			'GITHUB_ACTIONS',
		);
	});

	it('reads the variables a project declares', () => {
		expect(
			isRunningInProjectCi({
				DELENDAI_CI_VARIABLES: 'MY_RUNNER, OTHER',
				MY_RUNNER: '1',
			}),
		).toBe(true);
	});

	it('counts CI=true only while no agent drives the process', () => {
		expect(ciEnvironmentMarker({ CI: 'true' })).toBe('CI');
		expect(ciEnvironmentMarker({ CI: '1' })).toBe('CI');
		expect(isRunningInProjectCi({ CI: '1', DELENDAI_AGENT_ID: 'x' })).toBe(
			false,
		);
		expect(isRunningInProjectCi({ CI: '1', AI_AGENT: 'a_b_agent' })).toBe(
			false,
		);
	});

	it('trusts a provider variable even beside an agent marker', () => {
		expect(
			isRunningInProjectCi({ GITHUB_ACTIONS: 'true', AI_AGENT: 'a' }),
		).toBe(true);
	});

	it('is false in a person shell and for a false or blank value', () => {
		expect(isRunningInProjectCi({})).toBe(false);
		expect(isRunningInProjectCi({ GITHUB_ACTIONS: 'false' })).toBe(false);
		expect(isRunningInProjectCi({ GITLAB_CI: ' ' })).toBe(false);
	});
});
