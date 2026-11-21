import { describe, expect, it } from 'vitest';

import {
	inflightStep,
	watchdogIssueStep,
	watchdogPassStep,
} from '@delendai/core/lib/integration/land/land-watchdog-steps.helper';

const envLines = (env: Readonly<Record<string, string>>): string[] => [
	'  env:',
	...Object.entries(env).map(([key, value]) => `    ${key}: ${value}`),
];
const token = { GH_TOKEN: 'tok' };

describe('the watchdog steps', () => {
	it('[<20ms] the in-flight look only runs on the schedule', () => {
		const text = inflightStep(envLines, token).join('\n');
		expect(text).toContain('id: inflight');
		expect(text).toContain("github.event_name == 'schedule'");
	});

	it('[<20ms] the pass is strict only with no event pass in flight and records its exit code', () => {
		const text = watchdogPassStep(envLines, token, 'run-pass').join('\n');
		expect(text).toContain("steps.inflight.outputs.count == '0'");
		expect(text).toContain('run-pass || rc=$?');
		expect(text).toContain('echo "rc=${rc}" >> "${GITHUB_OUTPUT}"');
	});

	it('[<20ms] the issue step reads the exit code, the run and the evidence', () => {
		const text = watchdogIssueStep(envLines, token).join('\n');
		expect(text).toContain('!cancelled()');
		expect(text).toContain('RC: ${{ steps.pass.outputs.rc }}');
		expect(text).toContain('SHA: ${{ github.sha }}');
	});
});
