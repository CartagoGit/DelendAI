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
import { resolve } from 'node:path';

import { readdir, readFile, stat } from 'node:fs/promises';

import {
	diagnosePluginWiring,
	type IPluginWiringFs,
	type IPluginWiringReport,
} from '@mcp-vertex/core/public';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
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
				return hasIndex ? entry.name : undefined;
			}),
	);
	return ids.filter((id): id is string => id !== undefined).sort();
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

const main = async (argv: readonly string[]): Promise<void> => {
	const pluginId = argv[0]?.replace(/^plugins\//u, '');
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
	if (reports.some((report) => !report.fullyWired)) {
		process.exitCode = 1;
	}
};

if (import.meta.main) {
	void main(process.argv.slice(2));
}
