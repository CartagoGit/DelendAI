#!/usr/bin/env bun
/**
 * cli-ui-parity.script.ts — f00098 S4 (gate).
 *
 * The CLI and the extension UI are one product on three hosts, so they
 * are kept codependent by contract: every CLI command group must have a
 * discoverable UI affordance (a contributed VS Code command, a view, or
 * a web route) OR an explicit documented waiver — and every contributed
 * VS Code command must have a scriptable CLI counterpart or a waiver.
 *
 * The contract itself is declarative and lives next to this script in
 * `cli-ui-parity.map.json`. This script only cross-checks that map
 * against reality (the CLI registry + the extension manifest), the same
 * way lint:cli-coverage ratchets tool→CLI coverage:
 *
 *   - CLI groups are discovered from `packages/cli/src/commands/registry.ts`
 *     plus its `./groups/<x>` imports (top-level `name:` declarations,
 *     first token = group — mirrors cli-coverage.script.ts discovery).
 *   - UI surface is discovered from `extensions/vscode/package.json`
 *     (`contributes.commands` + `contributes.views`).
 *
 * New CLI groups can never silently lack a UI story again; new webview
 * commands can never silently lack a scriptable counterpart.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_REGISTRY = 'packages/cli/src/commands/registry.ts';
const DEFAULT_GROUPS_DIR = 'packages/cli/src/commands/groups';
const DEFAULT_VSCODE_PACKAGE = 'extensions/vscode/package.json';
const DEFAULT_MAP = 'tools/scripts/lint/cli-ui-parity.map.json';

/**
 * A waiver must be a documented reason, not a "TODO". Twelve characters
 * is deliberately low — it only blocks placeholder noise.
 */
export const MIN_WAIVER_LENGTH = 12;

const UI_AFFORDANCE_KINDS = [
	'vscode-command',
	'vscode-view',
	'web-route',
] as const;

export type UiAffordanceKind = (typeof UI_AFFORDANCE_KINDS)[number];

export interface IUiAffordance {
	readonly kind: UiAffordanceKind;
	readonly id: string;
	readonly note?: string;
}

export interface ICliGroupMapping {
	readonly ui?: IUiAffordance;
	readonly waiver?: string;
}

export interface IVscodeCommandMapping {
	readonly cli?: string;
	readonly note?: string;
	readonly waiver?: string;
}

export interface IParityMap {
	readonly cliGroups: Readonly<Record<string, ICliGroupMapping>>;
	readonly vscodeCommands: Readonly<Record<string, IVscodeCommandMapping>>;
}

export interface IVscodeContributions {
	readonly commands: readonly string[];
	readonly views: readonly string[];
}

export interface IParityFinding {
	readonly subject: string;
	readonly reason: string;
}

export interface IParityStats {
	readonly cliMapped: number;
	readonly cliWaived: number;
	readonly vscodeMapped: number;
	readonly vscodeWaived: number;
}

export interface ICliUiParityReport {
	readonly groups: readonly string[];
	readonly vscodeCommands: readonly string[];
	readonly findings: readonly IParityFinding[];
	readonly stats: IParityStats;
}

export interface IParityPaths {
	readonly registryPath: string;
	readonly groupsDir: string;
	readonly vscodePackagePath: string;
	readonly mapPath: string;
}

/**
 * Top-level command declarations sit at 1 tab (group files, standalone
 * consts) or 2 tabs (inline registry array entries). Deeper `name:`
 * properties are runtime payloads (e.g. doctor sections), not commands.
 */
const COMMAND_NAME = /^\t{1,2}name:\s*['"]([^'"]+)['"]/gm;
const GROUP_IMPORT = /from\s+['"]\.\/groups\/([^'"]+)['"]/g;

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Group-file module ids imported by the registry (`./groups/<x>`). */
export const extractGroupImports = (
	registryText: string,
): readonly string[] => {
	const names = new Set<string>();
	for (const match of registryText.matchAll(GROUP_IMPORT)) {
		const name = match[1]?.trim();
		if (name !== undefined && name.length > 0) names.add(name);
	}
	return [...names].sort();
};

/**
 * CLI command groups: the first whitespace-separated token of every
 * top-level registered command name across the given source texts.
 */
export const extractCliGroups = (
	sources: readonly string[],
): readonly string[] => {
	const groups = new Set<string>();
	for (const source of sources) {
		for (const match of source.matchAll(COMMAND_NAME)) {
			// A command object is declared directly in the registry or in a
			// group module. Objects pushed into a runtime collection (for
			// example `sections.push({ name: 'env' })` in `doctor`) are data,
			// not CLI registrations, even when their indentation matches a
			// command entry.
			const before = source.slice(0, match.index ?? 0).trimEnd();
			const previousLine = before
				.slice(before.lastIndexOf('\n') + 1)
				.trim();
			if (/\.push\(\{\s*$/.test(previousLine)) continue;
			const group = match[1]?.trim().split(/\s+/)[0];
			if (group !== undefined && group.length > 0) groups.add(group);
		}
	}
	return [...groups].sort();
};

/** Command ids + view ids contributed by the VS Code extension manifest. */
export const extractVscodeContributions = (
	packageJson: unknown,
): IVscodeContributions => {
	const commands = new Set<string>();
	const views = new Set<string>();
	const contributes = isRecord(packageJson)
		? packageJson.contributes
		: undefined;
	if (isRecord(contributes)) {
		if (Array.isArray(contributes.commands)) {
			for (const entry of contributes.commands) {
				if (isRecord(entry) && typeof entry.command === 'string') {
					commands.add(entry.command);
				}
			}
		}
		if (isRecord(contributes.views)) {
			for (const container of Object.values(contributes.views)) {
				if (!Array.isArray(container)) continue;
				for (const view of container) {
					if (isRecord(view) && typeof view.id === 'string') {
						views.add(view.id);
					}
				}
			}
		}
	}
	return { commands: [...commands].sort(), views: [...views].sort() };
};

const MAP_HINT = `add it to ${DEFAULT_MAP}`;

const isDocumentedWaiver = (waiver: unknown): waiver is string =>
	typeof waiver === 'string' && waiver.trim().length >= MIN_WAIVER_LENGTH;

const checkWaiverShape = (
	subject: string,
	waiver: unknown,
	findings: IParityFinding[],
): void => {
	if (waiver !== undefined && !isDocumentedWaiver(waiver)) {
		findings.push({
			subject,
			reason: `waiver must be a documented reason of at least ${MIN_WAIVER_LENGTH} characters, got ${JSON.stringify(waiver)}`,
		});
	}
};

const checkCliGroupEntry = (
	group: string,
	entry: ICliGroupMapping,
	contributions: IVscodeContributions,
	findings: IParityFinding[],
): void => {
	const subject = `cliGroups["${group}"]`;
	if (entry.ui !== undefined && entry.waiver !== undefined) {
		findings.push({
			subject,
			reason: 'has both "ui" and "waiver" — keep exactly one so the contract stays unambiguous',
		});
		return;
	}
	if (entry.ui === undefined) {
		if (entry.waiver === undefined) {
			findings.push({
				subject,
				reason: 'needs a "ui" affordance ({ kind, id }) or a documented "waiver" reason',
			});
			return;
		}
		checkWaiverShape(subject, entry.waiver, findings);
		return;
	}
	const { kind, id } = entry.ui;
	if (!UI_AFFORDANCE_KINDS.includes(kind)) {
		findings.push({
			subject,
			reason: `ui.kind "${String(kind)}" is not one of: ${UI_AFFORDANCE_KINDS.join(', ')}`,
		});
		return;
	}
	if (typeof id !== 'string' || id.length === 0) {
		findings.push({ subject, reason: 'ui.id must be a non-empty string' });
		return;
	}
	if (kind === 'vscode-command' && !contributions.commands.includes(id)) {
		findings.push({
			subject,
			reason: `ui.id "${id}" is not a contributed command in ${DEFAULT_VSCODE_PACKAGE} (contributes.commands)`,
		});
	}
	if (kind === 'vscode-view' && !contributions.views.includes(id)) {
		findings.push({
			subject,
			reason: `ui.id "${id}" is not a contributed view in ${DEFAULT_VSCODE_PACKAGE} (contributes.views)`,
		});
	}
	if (kind === 'web-route' && !id.startsWith('/')) {
		findings.push({
			subject,
			reason: `ui.id "${id}" must be an absolute web route (starting with "/")`,
		});
	}
};

const checkVscodeCommandEntry = (
	command: string,
	entry: IVscodeCommandMapping,
	groups: readonly string[],
	findings: IParityFinding[],
): void => {
	const subject = `vscodeCommands["${command}"]`;
	if (entry.cli !== undefined && entry.waiver !== undefined) {
		findings.push({
			subject,
			reason: 'has both "cli" and "waiver" — keep exactly one so the contract stays unambiguous',
		});
		return;
	}
	if (entry.cli === undefined) {
		if (entry.waiver === undefined) {
			findings.push({
				subject,
				reason: 'needs a "cli" counterpart (command or group) or a documented "waiver" reason',
			});
			return;
		}
		checkWaiverShape(subject, entry.waiver, findings);
		return;
	}
	const group = entry.cli.trim().split(/\s+/)[0] ?? '';
	if (!groups.includes(group)) {
		findings.push({
			subject,
			reason: `cli counterpart "${entry.cli}" does not start with a registered CLI command group`,
		});
	}
};

/** Parse the raw JSON map; structural problems become findings. */
export const parseParityMap = (
	raw: unknown,
): {
	readonly map: IParityMap;
	readonly findings: readonly IParityFinding[];
} => {
	const findings: IParityFinding[] = [];
	const empty: IParityMap = { cliGroups: {}, vscodeCommands: {} };
	if (!isRecord(raw)) {
		findings.push({
			subject: DEFAULT_MAP,
			reason: 'map must be a JSON object with "cliGroups" and "vscodeCommands"',
		});
		return { map: empty, findings };
	}
	const cliGroups = isRecord(raw.cliGroups) ? raw.cliGroups : undefined;
	const vscodeCommands = isRecord(raw.vscodeCommands)
		? raw.vscodeCommands
		: undefined;
	if (cliGroups === undefined) {
		findings.push({
			subject: DEFAULT_MAP,
			reason: 'missing "cliGroups" object (CLI group → UI affordance or waiver)',
		});
	}
	if (vscodeCommands === undefined) {
		findings.push({
			subject: DEFAULT_MAP,
			reason: 'missing "vscodeCommands" object (contributed command → CLI counterpart or waiver)',
		});
	}
	return {
		map: {
			cliGroups: (cliGroups ?? {}) as Record<string, ICliGroupMapping>,
			vscodeCommands: (vscodeCommands ?? {}) as Record<
				string,
				IVscodeCommandMapping
			>,
		},
		findings,
	};
};

/** Pure cross-check: map ↔ CLI registry groups ↔ extension manifest. */
export const checkParity = (
	groups: readonly string[],
	contributions: IVscodeContributions,
	map: IParityMap,
): readonly IParityFinding[] => {
	const findings: IParityFinding[] = [];

	if (groups.length === 0) {
		findings.push({
			subject: '<registry>',
			reason: 'no CLI command groups were discovered — registry path wrong?',
		});
	}
	if (contributions.commands.length === 0) {
		findings.push({
			subject: '<vscode>',
			reason: 'no contributed VS Code commands were discovered — manifest path wrong?',
		});
	}

	// Direction 1: every CLI group needs a UI story (or a waiver).
	for (const group of groups) {
		const entry = map.cliGroups[group];
		if (entry === undefined) {
			findings.push({
				subject: group,
				reason: `CLI command group "${group}" has no UI parity entry — ${MAP_HINT} under cliGroups with a ui affordance or a documented waiver`,
			});
			continue;
		}
		checkCliGroupEntry(group, entry, contributions, findings);
	}

	// Direction 2: every contributed command needs a CLI story (or a waiver).
	for (const command of contributions.commands) {
		const entry = map.vscodeCommands[command];
		if (entry === undefined) {
			findings.push({
				subject: command,
				reason: `contributed VS Code command "${command}" has no CLI parity entry — ${MAP_HINT} under vscodeCommands with a cli counterpart or a documented waiver`,
			});
			continue;
		}
		checkVscodeCommandEntry(command, entry, groups, findings);
	}

	// Stale entries rot the contract: every map key must still exist.
	for (const group of Object.keys(map.cliGroups)) {
		if (!groups.includes(group)) {
			findings.push({
				subject: `cliGroups["${group}"]`,
				reason: 'does not match any registered CLI command group — remove the stale entry or fix the name',
			});
		}
	}
	for (const command of Object.keys(map.vscodeCommands)) {
		if (!contributions.commands.includes(command)) {
			findings.push({
				subject: `vscodeCommands["${command}"]`,
				reason: `is not contributed by ${DEFAULT_VSCODE_PACKAGE} — remove the stale entry or fix the id`,
			});
		}
	}

	return findings;
};

export const computeStats = (map: IParityMap): IParityStats => {
	const cli = Object.values(map.cliGroups);
	const vscode = Object.values(map.vscodeCommands);
	return {
		cliMapped: cli.filter((entry) => entry.ui !== undefined).length,
		cliWaived: cli.filter(
			(entry) => entry.ui === undefined && entry.waiver !== undefined,
		).length,
		vscodeMapped: vscode.filter((entry) => entry.cli !== undefined).length,
		vscodeWaived: vscode.filter(
			(entry) => entry.cli === undefined && entry.waiver !== undefined,
		).length,
	};
};

export const detectCliUiParity = async (
	paths: Partial<IParityPaths> = {},
): Promise<ICliUiParityReport> => {
	const registryPath = abs(paths.registryPath ?? DEFAULT_REGISTRY);
	const groupsDir = abs(paths.groupsDir ?? DEFAULT_GROUPS_DIR);
	const vscodePackagePath = abs(
		paths.vscodePackagePath ?? DEFAULT_VSCODE_PACKAGE,
	);
	const mapPath = abs(paths.mapPath ?? DEFAULT_MAP);

	const registryText = await readFile(registryPath, 'utf8');
	const groupTexts = await Promise.all(
		extractGroupImports(registryText).map((name) =>
			readFile(join(groupsDir, `${name}.ts`), 'utf8'),
		),
	);
	const groups = extractCliGroups([registryText, ...groupTexts]);
	const contributions = extractVscodeContributions(
		JSON.parse(await readFile(vscodePackagePath, 'utf8')) as unknown,
	);
	const { map, findings: mapFindings } = parseParityMap(
		JSON.parse(await readFile(mapPath, 'utf8')) as unknown,
	);
	const findings =
		mapFindings.length > 0
			? mapFindings
			: checkParity(groups, contributions, map);

	return {
		groups,
		vscodeCommands: contributions.commands,
		findings,
		stats: computeStats(map),
	};
};

export const formatReport = (report: ICliUiParityReport): string => {
	const { stats } = report;
	if (report.findings.length === 0) {
		return `✓ cli-ui-parity: ${report.groups.length} CLI groups (${stats.cliMapped} mapped, ${stats.cliWaived} waived) ↔ ${report.vscodeCommands.length} VS Code commands (${stats.vscodeMapped} mapped, ${stats.vscodeWaived} waived).\n`;
	}
	const lines = [
		`✗ cli-ui-parity: ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of report.findings) {
		lines.push(`  ${finding.subject}: ${finding.reason}`);
	}
	lines.push(
		'',
		`Keep the CLI and the UI codependent: map every CLI command group to a UI affordance and every contributed command to a CLI counterpart in ${DEFAULT_MAP}, or document a waiver.`,
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectCliUiParity();
	const text = formatReport(report);
	if (report.findings.length === 0) {
		process.stdout.write(text);
		return 0;
	}
	process.stderr.write(text);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
