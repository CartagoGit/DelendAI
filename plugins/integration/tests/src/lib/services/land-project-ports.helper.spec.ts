/** land-project-ports.helper.spec.ts — what a project's policy and commands give a pass, with git and its commands in memory. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import {
	landProjectPorts,
	parseJobs,
} from '../../../../src/lib/services/land-project-ports.helper';
import {
	zoneNameOf,
	zonesOfFiles,
} from '../../../../src/lib/services/land-zones.helper';

const options = (integration: Record<string, unknown> = {}) =>
	resolveDevelopmentPolicy({ development: { integration } }).integration;

const ports = (
	integration: Record<string, unknown>,
	answers: { diff?: string; status?: string; command?: string } = {},
) => {
	const ran: string[] = [];
	return {
		ran,
		ports: landProjectPorts({
			root: '/repo',
			options: options(integration),
			exec: (_cwd, args) =>
				args.includes('--name-only')
					? (answers.diff ?? '')
					: (answers.status ?? ''),
			runCommand: (cwd, line) => {
				ran.push(`${cwd}: ${line}`);
				return { ok: line !== 'fails', stdout: answers.command ?? '' };
			},
		}),
	};
};

describe('zones', () => {
	it('[<20ms] are named by their last literal segment and match the files under them', () => {
		expect(zoneNameOf('packages/core/**')).toBe('core');
		expect(zoneNameOf('tools')).toBe('tools');
		const zones = ['packages/core/**', 'apps/*'];
		expect([
			...(zonesOfFiles(zones, new Set(['packages/core/a.ts'])) ?? []),
		]).toEqual(['core']);
		expect(zonesOfFiles(zones, new Set(['README.md']))).toBeUndefined();
		expect(zonesOfFiles([], new Set(['a']))).toBeUndefined();
	});
});

describe('parseJobs', () => {
	it('[<20ms] reads one zone per line and `*` as every zone', () => {
		expect([...(parseJobs('core\n\nweb\n') ?? [])]).toEqual([
			'core',
			'web',
		]);
		expect(parseJobs('core\n*')).toBeUndefined();
	});
});

describe('landProjectPorts', () => {
	it('[<20ms] reads the section of a check from the declared zones', () => {
		const { sectionOfCheck } = ports({ zones: ['packages/core/**'] }).ports;
		expect(sectionOfCheck('tests: core 2/4')).toBe('core');
		expect(sectionOfCheck('lint')).toBeUndefined();
		expect(ports({}).ports.sectionOfCheck('tests: core')).toBeUndefined();
	});

	it('[<20ms] takes the footprint from the zones when the project names no command', () => {
		const { ports: p } = ports(
			{ zones: ['packages/core/**'] },
			{ diff: 'packages/core/a.ts\n' },
		);
		const footprint = p.footprintOf('base', 'head');
		expect(footprint.files).toEqual(new Set(['packages/core/a.ts']));
		expect(footprint.zones).toEqual(new Set(['core']));
	});

	it('[<20ms] takes it from the jobs command, with both revisions, when the project names one', () => {
		const { ports: p, ran } = ports(
			{ commands: { jobs: 'jobs.sh' } },
			{ diff: 'x.ts', command: 'core\nweb\n' },
		);
		expect(p.footprintOf('b', 'h').zones).toEqual(new Set(['core', 'web']));
		expect(ran).toEqual(['/repo: jobs.sh b h']);
	});

	it('[<20ms] reaches every zone when nothing bounds the change, and none when nothing changed', () => {
		expect(
			ports({}, { diff: 'x.ts' }).ports.footprintOf('b', 'h').zones,
		).toBe('everything');
		expect(
			ports({}, { diff: '' }).ports.footprintOf('b', 'h').zones,
		).toEqual(new Set());
	});

	it('[<20ms] regenerates with the derived command and normalizes with the batch command', () => {
		const { ports: p, ran } = ports({
			derived: { paths: ['gen.md'], command: 'gen' },
			commands: { normalizeBatch: 'norm' },
		});
		const subjects: string[] = [];
		expect(p.derivedPaths).toEqual(new Set(['gen.md']));
		expect(p.regenerate('/tree')).toBe(true);
		p.normalizeBatch('/tree', (subject) => subjects.push(subject));
		expect(ran).toEqual(['/tree: gen', '/tree: norm']);
		expect(subjects).toHaveLength(1);
	});

	it('[<20ms] does nothing a project did not name', () => {
		const { ports: p, ran } = ports({});
		const subjects: string[] = [];
		expect(p.regenerate('/tree')).toBe(true);
		p.normalizeBatch('/tree', (subject) => subjects.push(subject));
		expect(ran).toEqual([]);
		expect(subjects).toEqual([]);
	});
});
