import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { IParityMap, IVscodeContributions } from './cli-ui-parity.script';
import {
	checkParity,
	detectCliUiParity,
	extractCliGroups,
	extractGroupImports,
	extractVscodeContributions,
	formatReport,
	parseParityMap,
} from './cli-ui-parity.script';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const contributions: IVscodeContributions = {
	commands: ['mcp-vertex.showMetrics', 'mcp-vertex.refresh'],
	views: ['mcp-vertex.memory'],
};

const passingMap: IParityMap = {
	cliGroups: {
		metrics: {
			ui: { kind: 'vscode-command', id: 'mcp-vertex.showMetrics' },
		},
		memory: { ui: { kind: 'vscode-view', id: 'mcp-vertex.memory' } },
		completion: {
			waiver: 'shell-only: prints completion scripts, meaningless in a UI host',
		},
	},
	vscodeCommands: {
		'mcp-vertex.showMetrics': { cli: 'metrics' },
		'mcp-vertex.refresh': {
			waiver: 'UI refresh affordance; no scriptable counterpart needed',
		},
	},
};

const groups = ['completion', 'memory', 'metrics'] as const;

describe('cli-ui-parity.script', () => {
	it('extracts CLI groups from top-level command names only', () => {
		const registry = [
			'const listCommand: ICliCommand = {',
			"\tname: 'plugin list',",
			'};',
			'export const registerAllCommands = async () => [',
			'\t{',
			"\t\tname: 'config show',",
			'\t},',
			'\t{',
			"\t\tname: 'config set',",
			'\t},',
			'];',
		].join('\n');
		const group = [
			'const doctorCommand: ICliCommand = {',
			"\tname: 'doctor',",
			'\tasync run(_args, ctx) {',
			'\t\t\tsections.push({',
			"\t\t\t\tname: 'env',",
			'\t\t\t});',
			'\t},',
			'};',
		].join('\n');
		const pushedData = [
			'const rows = [];',
			'rows.push({',
			"\tname: 'not-a-command',",
			'});',
		].join('\n');
		expect(extractCliGroups([registry, group, pushedData])).toEqual([
			'config',
			'doctor',
			'plugin',
		]);
	});

	it('extracts group module ids imported by the registry', () => {
		const registry = [
			"import { auditCommands } from './groups/audit';",
			"import { gitStatusCommand } from './groups/git';",
			"import { formatRows } from '../lib/text-format.service';",
		].join('\n');
		expect(extractGroupImports(registry)).toEqual(['audit', 'git']);
	});

	it('extracts contributed command ids and view ids from the manifest', () => {
		const manifest = {
			contributes: {
				commands: [
					{ command: 'x.b', title: 'B' },
					{ command: 'x.a', title: 'A' },
				],
				views: { x: [{ id: 'x.view', name: 'View' }] },
			},
		};
		expect(extractVscodeContributions(manifest)).toEqual({
			commands: ['x.a', 'x.b'],
			views: ['x.view'],
		});
	});

	it('passes when every group and every contributed command is mapped or waived', () => {
		expect(checkParity(groups, contributions, passingMap)).toEqual([]);
	});

	it('flags an unmapped CLI group with an actionable message', () => {
		const map: IParityMap = {
			...passingMap,
			cliGroups: { ...passingMap.cliGroups },
		};
		const { metrics: _dropped, ...rest } = map.cliGroups;
		const findings = checkParity(groups, contributions, {
			...map,
			cliGroups: rest,
		});
		expect(findings).toHaveLength(1);
		expect(formatReport(report(findings))).toContain(
			'CLI command group "metrics" has no UI parity entry',
		);
	});

	it('flags an unmapped contributed VS Code command', () => {
		const { 'mcp-vertex.refresh': _dropped, ...rest } =
			passingMap.vscodeCommands;
		const findings = checkParity(groups, contributions, {
			...passingMap,
			vscodeCommands: rest,
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toContain('has no CLI parity entry');
	});

	it('flags stale map entries in both directions', () => {
		const findings = checkParity(groups, contributions, {
			cliGroups: {
				...passingMap.cliGroups,
				ghost: { waiver: 'this group was deleted long ago' },
			},
			vscodeCommands: {
				...passingMap.vscodeCommands,
				'mcp-vertex.ghost': { cli: 'metrics' },
			},
		});
		expect(findings).toHaveLength(2);
		expect(findings[0]?.subject).toBe('cliGroups["ghost"]');
		expect(findings[1]?.subject).toBe('vscodeCommands["mcp-vertex.ghost"]');
	});

	it('flags a ui affordance that is not actually contributed', () => {
		const findings = checkParity(groups, contributions, {
			...passingMap,
			cliGroups: {
				...passingMap.cliGroups,
				metrics: {
					ui: { kind: 'vscode-command', id: 'mcp-vertex.missing' },
				},
			},
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toContain(
			'"mcp-vertex.missing" is not a contributed command',
		);
	});

	it('flags a cli counterpart that names no registered group', () => {
		const findings = checkParity(groups, contributions, {
			...passingMap,
			vscodeCommands: {
				...passingMap.vscodeCommands,
				'mcp-vertex.showMetrics': { cli: 'telemetry report' },
			},
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toContain(
			'does not start with a registered CLI command group',
		);
	});

	it('rejects placeholder waivers and ambiguous double entries', () => {
		const findings = checkParity(groups, contributions, {
			...passingMap,
			cliGroups: {
				...passingMap.cliGroups,
				completion: { waiver: 'TODO' },
				memory: {
					ui: { kind: 'vscode-view', id: 'mcp-vertex.memory' },
					waiver: 'also waived, which is ambiguous',
				},
			},
		});
		expect(findings).toHaveLength(2);
		expect(findings.map((finding) => finding.reason).join('\n')).toContain(
			'documented reason',
		);
		expect(findings.map((finding) => finding.reason).join('\n')).toContain(
			'keep exactly one',
		);
	});

	it('turns a structurally invalid map into findings instead of throwing', () => {
		const { findings } = parseParityMap([]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toContain('must be a JSON object');
	});

	it('passes on the real repository with the checked-in map', async () => {
		const result = await detectCliUiParity({
			registryPath: join(
				REPO_ROOT,
				'packages/cli/src/commands/registry.ts',
			),
			groupsDir: join(REPO_ROOT, 'packages/cli/src/commands/groups'),
			vscodePackagePath: join(
				REPO_ROOT,
				'extensions/vscode/package.json',
			),
			mapPath: join(
				REPO_ROOT,
				'tools/scripts/lint/cli-ui-parity.map.json',
			),
		});
		expect(result.findings).toEqual([]);
		expect(result.groups).toContain('usage-tracking');
		expect(result.vscodeCommands).toContain('mcp-vertex.openDashboard');
		expect(formatReport(result)).toContain('✓ cli-ui-parity');
	});
});

const report = (
	findings: ReturnType<typeof checkParity>,
): Parameters<typeof formatReport>[0] => ({
	groups: [...groups],
	vscodeCommands: contributions.commands,
	findings,
	stats: { cliMapped: 0, cliWaived: 0, vscodeMapped: 0, vscodeWaived: 0 },
});
