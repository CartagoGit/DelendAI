#!/usr/bin/env bun
/**
 * detail-levels-coverage.script.ts — f00271 S2.
 *
 * Warning-only structural coverage snapshot for the transversal
 * `detail: compact | normal | full` contract. The rollout is gradual,
 * so this script reports which tool source files already show the shared
 * markers (`DETAIL_LEVELS`, `DetailSchema`, `projectDetail`) instead of
 * failing the build while migration is still in progress.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const PLUGINS_ROOT = 'plugins';
const TOOL_FILE = /\/src\/lib\/tools\/.+\.ts$/;
const REGISTER_TOOL = /server\.registerTool\(/g;
const DETAIL_LEVELS_IMPORT = /\bDETAIL_LEVELS\b/;
const DETAIL_SCHEMA = /const\s+DetailSchema\s*=\s*z\.enum\(DETAIL_LEVELS\)/;
const DETAIL_INPUT = /detail:\s*DetailSchema\.optional\(\)/;
const PROJECT_DETAIL = /\bprojectDetail\s*\(/;

export interface IDetailCoverageFinding {
	readonly file: string;
	readonly tools: number;
	readonly reasons: readonly string[];
}

export interface IDetailCoverageReport {
	readonly scannedFiles: readonly string[];
	readonly adopted: readonly string[];
	readonly findings: readonly IDetailCoverageFinding[];
}

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules' && entry.name !== 'dist') {
					stack.push(full);
				}
				continue;
			}
			if (entry.isFile() && TOOL_FILE.test(full)) out.push(full);
		}
	}
	return out.sort();
};

export const detectDetailCoverage = async (): Promise<IDetailCoverageReport> => {
	const files = await walk(abs(PLUGINS_ROOT));
	const findings: IDetailCoverageFinding[] = [];
	const adopted: string[] = [];
	for (const file of files) {
		const text = await readFile(file, 'utf8');
		const tools = [...text.matchAll(REGISTER_TOOL)].length;
		if (tools === 0) continue;
		const reasons: string[] = [];
		if (!DETAIL_LEVELS_IMPORT.test(text)) {
			reasons.push('missing DETAIL_LEVELS import/usage');
		}
		if (!DETAIL_SCHEMA.test(text)) {
			reasons.push('missing DetailSchema = z.enum(DETAIL_LEVELS)');
		}
		if (!DETAIL_INPUT.test(text)) {
			reasons.push('missing detail: DetailSchema.optional() in input schema');
		}
		if (!PROJECT_DETAIL.test(text)) {
			reasons.push('missing projectDetail(...) projection');
		}
		const rel = relative(REPO_ROOT, file);
		if (reasons.length === 0) adopted.push(rel);
		else findings.push({ file: rel, tools, reasons });
	}
	return {
		scannedFiles: files.map((file) => relative(REPO_ROOT, file)),
		adopted: adopted.sort(),
		findings,
	};
};

export const formatReport = (report: IDetailCoverageReport): string => {
	const lines = [
		`detail-levels-coverage: ${report.adopted.length} adopted, ${report.findings.length} pending, ${report.scannedFiles.length} tool files scanned.`,
	];
	if (report.adopted.length > 0) {
		lines.push('', 'adopted:');
		for (const file of report.adopted) lines.push(`  - ${file}`);
	}
	if (report.findings.length > 0) {
		lines.push('', 'pending (warning only):');
		for (const finding of report.findings) {
			lines.push(`  - ${finding.file} (${finding.tools} tool block(s))`);
			for (const reason of finding.reasons) {
				lines.push(`      ${reason}`);
			}
		}
	}
	lines.push('');
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectDetailCoverage();
	process.stdout.write(formatReport(report));
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}