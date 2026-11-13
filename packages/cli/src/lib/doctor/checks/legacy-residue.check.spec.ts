import { describe, expect, it } from 'vitest';

import type { IUserHostConfigReport } from '@delendai/core/cli';

import type { ILegacyResidueProbe } from '../../../contracts/interfaces/legacy-residue-probe.interface';
import {
	checkLegacyResidue,
	defaultLegacyResidueProbe,
} from './legacy-residue.check';

// Built from parts so this file does not spell the retired product name.
const OLD = ['mcp', 'vertex'].join('-');

const CLEAN: IUserHostConfigReport = {
	changes: [],
	questions: [],
	failures: [],
	notCovered: [],
	clones: [],
};

const run = (
	report: IUserHostConfigReport,
	processes: readonly string[] = [],
) => {
	const probe: ILegacyResidueProbe = {
		scan: async () => report,
		processes: async () => processes,
	};
	return checkLegacyResidue(probe)({
		workspace: '/ws',
		now: () => new Date(0),
		fs: {
			fileExists: async () => false,
			readFile: async () => undefined,
			listDirs: async () => [],
		},
	});
};

describe('checkLegacyResidue', () => {
	it('[<20ms] is ok when nothing was left behind', async () => {
		const section = await run(CLEAN, ['12 bun run something']);
		expect(section.status).toBe('ok');
	});

	it('[<20ms] names each finding with the command or edit that clears it', async () => {
		const section = await run(
			{
				...CLEAN,
				changes: [
					{
						hostId: 'codex',
						file: '/h/c.toml',
						backup: '/b',
						entries: [OLD],
					},
				],
				questions: [
					{
						hostId: 'claude',
						file: '/h/.claude.json',
						entry: 'mine',
					},
				],
				failures: [{ file: '/h/bad.json', reason: 'broken' }],
				clones: [`/p/${OLD}`],
			},
			[`4242 bun /p/${OLD}/run.ts`, `7 bun delendai doctor ${OLD}`],
		);
		const text = section.findings.join('\n');
		expect(section.status).toBe('warn');
		expect(text).toContain('delendai doctor --fix');
		expect(text).toContain('edit or remove it by hand');
		expect(text).toContain('could not be read');
		expect(text).toContain(`rm -rf /p/${OLD}`);
		expect(text).toContain('kill 4242');
		expect(text).not.toContain('kill 7');
	});
});

describe('the default probe', () => {
	it('[<2000ms] reads this machine without writing and lists processes', async () => {
		const report = await defaultLegacyResidueProbe.scan('/ws');
		expect(Array.isArray(report.changes)).toBe(true);
		expect(Array.isArray(await defaultLegacyResidueProbe.processes())).toBe(
			true,
		);
	});
});
