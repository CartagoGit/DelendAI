#!/usr/bin/env bun
/**
 * f00120 S4 — `verify:plugin-wiring` gate.
 *
 * Reads each of the six wiring files (the same ones the writer touches),
 * asks the in-source-of-truth checkers whether each wiring point is
 * present, and exits non-zero if any are missing. Pass with a one-liner:
 *
 *   bun tools/scripts/verify/plugin-wiring.script.ts plugins/<id>
 *
 * Exits 0 when every point is wired, 1 with a remediation list when not.
 *
 * The script is **read-only** by design. The writer (wire-plugin.ts) is the
 * thing that produces the writes; the doctor is the thing that asserts the
 * end state. They share the `IPluginWiringFs` interface and the in-test
 * fixtures, so a writer + doctor pair are guaranteed to agree.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readdir, readFile, stat } from 'node:fs/promises';

import {
	diagnosePluginWiring,
	type IPluginWiringFs,
	type IPluginWiringReport,
} from '@delendai/core/cli';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PLUGINS_ROOT = resolve(REPO_ROOT, 'plugins');

const realFs: IPluginWiringFs = {
	async readFile(path) {
		const absolute = path.startsWith('/') ? path : resolve(REPO_ROOT, path);
		return readFile(absolute, 'utf8');
	},
	async writeFile() {
		throw new Error('plugin-wiring doctor is read-only');
	},
	async pathExists(path) {
		const absolute = path.startsWith('/') ? path : resolve(REPO_ROOT, path);
		try {
			await stat(absolute);
			return true;
		} catch {
			return false;
		}
	},
};

const listPluginIds = async (): Promise<readonly string[]> => {
	const entries = await readdir(PLUGINS_ROOT, { withFileTypes: true });
	const ids = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const hasIndex = await realFs.pathExists(
					`plugins/${entry.name}/src/index.ts`,
				);
				if (!hasIndex) return undefined;
				const isPrivate = await isPrivatePlugin(entry.name);
				return isPrivate ? undefined : entry.name;
			}),
	);
	return ids.filter((id): id is string => id !== undefined).sort();
};

/**
 * A plugin marked `"private": true` is internal-only: it is not
 * published, sits outside every preset and outside `PUBLISH_ORDER`, so
 * the public six-point wiring contract does not apply. The doctor skips
 * it instead of demanding preset/publish/defaults entries that must not
 * exist for an internal package.
 */
const isPrivatePlugin = async (id: string): Promise<boolean> => {
	try {
		const raw = await realFs.readFile(`plugins/${id}/package.json`);
		const parsed: unknown = JSON.parse(raw);
		return (
			typeof parsed === 'object' &&
			parsed !== null &&
			(parsed as { private?: unknown }).private === true
		);
	} catch {
		return false;
	}
};

const formatReport = (report: IPluginWiringReport): string => {
	const header = report.fullyWired
		? `✓ plugin-wiring: ${report.pluginId} is fully wired`
		: `✗ plugin-wiring: ${report.pluginId} is missing ${report.missing.length} wiring point(s)`;
	const lines: string[] = [header];
	for (const point of report.points) {
		const mark = point.wired ? '✓' : '✗';
		lines.push(`  ${mark} ${point.id.padEnd(16)} ${point.summary}`);
		if (!point.wired && point.remediation !== undefined) {
			lines.push(`       → ${point.remediation}`);
		}
	}
	return `${lines.join('\n')}\n`;
};

const formatAggregate = (reports: readonly IPluginWiringReport[]): string => {
	const failing = reports.filter((report) => !report.fullyWired);
	const lines = [
		failing.length === 0
			? `✓ plugin-wiring: ${reports.length} plugin(s) fully wired`
			: `✗ plugin-wiring: ${failing.length}/${reports.length} plugin(s) failed`,
	];
	for (const report of reports) {
		lines.push(formatReport(report).trimEnd());
	}
	return `${lines.join('\n')}\n`;
};

export type IDoctorPluginId = string;

/**
 * The plugins allowed to stay unwired, each with the reason a reviewer
 * accepted. An entry for a plugin that is now wired is stale and fails
 * too, so the list only shrinks.
 */
const ALLOWLIST_PATH = resolve(
	REPO_ROOT,
	'tools/scripts/verify/plugin-wiring.allowlist.json',
);

export const judgeWiring = (
	reports: readonly IPluginWiringReport[],
	allowed: Readonly<Record<string, string>>,
): readonly string[] => {
	if (reports.length === 0) {
		return ['no plugin was found: the gate measured nothing'];
	}
	const unwired = new Set(
		reports.filter((report) => !report.fullyWired).map((r) => r.pluginId),
	);
	return [
		...[...unwired]
			.filter((id) => allowed[id] === undefined)
			.map((id) => `${id} is not wired and is not on the allowlist`),
		...Object.keys(allowed)
			.filter((id) => !unwired.has(id))
			.map(
				(id) =>
					`${id} is on the allowlist but is wired (or gone): remove its entry`,
			),
	];
};

const main = async (argv: readonly string[]): Promise<void> => {
	const positional = argv.filter((arg) => !arg.startsWith('--'));

	const pluginId = positional[0]?.replace(/^plugins\//u, '');
	if (pluginId !== undefined && pluginId.length > 0) {
		const report = await diagnosePluginWiring(pluginId, realFs);
		process.stdout.write(formatReport(report));
		if (!report.fullyWired) {
			process.exitCode = 1;
		}
		return;
	}

	const pluginIds = await listPluginIds();
	const reports = await Promise.all(
		pluginIds.map(async (id) => diagnosePluginWiring(id, realFs)),
	);
	process.stdout.write(formatAggregate(reports));
	// The gate is strict everywhere: a `--report` mode that could not
	// fail ran in CI while four plugins stayed unwired.
	const allowed = JSON.parse(
		await readFile(ALLOWLIST_PATH, 'utf8'),
	) as Record<string, string>;
	const problems = judgeWiring(reports, allowed);
	for (const problem of problems) {
		process.stdout.write(`✗ plugin-wiring: ${problem}\n`);
	}
	if (problems.length > 0) process.exitCode = 1;
};

if (import.meta.main) {
	void main(process.argv.slice(2));
}
