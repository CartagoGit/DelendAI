import { describe, expect, it } from 'vitest';

import type { IRehearsalRun } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	realWorkflowNames,
	scanStarted,
} from '../../../../src/lib/services/rehearsal-scan.helper';

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'rehearsal-scan',
	event: 'push',
	headBranch: 'b',
	headSha: 'tip',
	status: 'completed',
	actor: 'bot',
	createdAt: '2026-11-12T10:00:00Z',
	updatedAt: '2026-11-12T10:00:00Z',
	...over,
});

describe('scanStarted', () => {
	it('[<5ms] is true for the scan workflow pushed at the sha', () => {
		expect(scanStarted([run({})], 'tip')).toBe(true);
	});

	it('[<5ms] is false when only another workflow, another event or another sha ran', () => {
		expect(scanStarted([run({ workflow: 'land' })], 'tip')).toBe(false);
		expect(scanStarted([run({ event: 'pull_request' })], 'tip')).toBe(
			false,
		);
		expect(scanStarted([run({ headSha: 'other' })], 'tip')).toBe(false);
	});
});

describe('the real mode workflow names', () => {
	const names = realWorkflowNames({
		'ci.yml': 'name: CI\n\non:\n  push:\n',
		'codeql.yml': "name: 'CodeQL'\n",
	});

	it('[<5ms] reads the name each project file lists its runs under', () => {
		expect(names).toEqual({ ci: 'CI', scan: 'CodeQL' });
	});

	it('[<5ms] reads quoted, bare and commented names, and a # inside quotes', () => {
		const nameOf = (line: string) =>
			realWorkflowNames({ 'ci.yml': `${line}\non:\n` }).ci;
		expect(nameOf("name: 'My CI'")).toBe('My CI');
		expect(nameOf('name: "My CI"  # c')).toBe('My CI');
		expect(nameOf('name: Bare CI   # trailing')).toBe('Bare CI');
		expect(nameOf('name: "CI #1"')).toBe('CI #1');
		expect(nameOf('name:')).toBe('.github/workflows/ci.yml');
		expect(nameOf('  name: indented')).toBe('.github/workflows/ci.yml');
	});

	it('[<20ms] returns at once on a line of 50,000 spaces after the key', () => {
		const text = `name:!${' '.repeat(50_000)}x\n`;
		expect(realWorkflowNames({ 'ci.yml': text }).ci).toBe(
			`!${' '.repeat(50_000)}x`,
		);
	});

	it('[<5ms] falls back to the file path for an unnamed workflow', () => {
		expect(realWorkflowNames({}).scan).toBe('.github/workflows/codeql.yml');
	});

	it('[<5ms] finds the project scan run, and not the stand-in', () => {
		expect(scanStarted([run({ workflow: 'CodeQL' })], 'tip', names)).toBe(
			true,
		);
		expect(scanStarted([run({})], 'tip', names)).toBe(false);
	});
});
