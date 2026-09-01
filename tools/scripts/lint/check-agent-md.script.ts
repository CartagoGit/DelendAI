#!/usr/bin/env bun
/**
 * check-agent-md.script.ts — f00190 (Track H of q00006).
 *
 * Drift check that complements `tools/scripts/gen/agent-md.script.ts`.
 * Re-runs the generator in-memory (no disk writes), compares each
 * existing AGENT.md's marker-delimited block against the live
 * regeneration; reports drift per file. Wired into `validate`.
 *
 * Exit codes:
 *   0 — every AGENT.md matches the generator's projected output.
 *   1 — at least one drift detected.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	generateAll,
	composeAgentMd,
	renderAgentMdBlock,
	type IAgentScope,
} from '../gen/agent-md.script';

const REPO_ROOT = process.cwd();

const MARKER_BEGIN = '<!-- mcp-vertex:begin agent-md -->';
const MARKER_END = '<!-- mcp-vertex:end agent-md -->';

export interface IAgentMdDrift {
	readonly relPath: string;
	readonly onDiskLen: number;
	readonly refreshedLen: number;
	readonly firstDivergence: number;
}

const findFirstDiff = (a: string, b: string): number => {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i += 1) {
		if (a[i] !== b[i]) return i;
	}
	return len;
};

/**
 * Compare the on-disk AGENT.md's marker block against the live
 * generator. Trailing whitespace differences inside the block (the
 * generator appends a final `\n`; some legacy writers did not) are
 * ignored so the regeneration workflow can rewrite the block
 * without spurious drift.
 */
export const diffScope = async (
	scope: IAgentScope,
	absDocPath: string,
): Promise<IAgentMdDrift | null> => {
	const onDisk = await readFile(absDocPath, 'utf8').catch(() => '');
	if (!onDisk.includes(MARKER_BEGIN)) return null;
	const diskStart = onDisk.indexOf(MARKER_BEGIN);
	const diskEnd = onDisk.indexOf(MARKER_END) + MARKER_END.length;
	const diskBlock = onDisk.slice(diskStart, diskEnd);
	const sections = await composeAgentMd(scope);
	const expected = renderAgentMdBlock(sections);
	const trim = (s: string): string => s.replace(/\s+$/, '');
	if (trim(diskBlock) === trim(expected)) return null;
	const relPath = absDocPath.startsWith(`${REPO_ROOT}/`)
		? absDocPath.slice(REPO_ROOT.length + 1)
		: absDocPath;
	return {
		relPath,
		onDiskLen: diskBlock.length,
		refreshedLen: expected.length,
		firstDivergence: findFirstDiff(diskBlock, expected),
	};
};

export const detectAgentMdDrift = async (): Promise<
	readonly IAgentMdDrift[]
> => {
	const drifts: IAgentMdDrift[] = [];
	// Same scope walk as `generateAll`, but each drift probe is
	// read-only — disk writes only happen when the generator is
	// invoked from the CLI.
	const { readdir } = await import('node:fs/promises');
	for (const top of ['packages', 'plugins']) {
		const dir = join(REPO_ROOT, top);
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const name = entry.name;
			const scope: IAgentScope = {
				dir: `${top}/${name}`,
				packageJson: `${top}/${name}/package.json`,
				isPlugin: top === 'plugins',
			};
			const drift = await diffScope(
				scope,
				join(REPO_ROOT, scope.dir, 'AGENT.md'),
			);
			if (drift !== null) drifts.push(drift);
		}
	}
	return drifts;
};

export const formatReport = (drifts: readonly IAgentMdDrift[]): string => {
	if (drifts.length === 0) {
		return 'check-agent-md: 0 drift(s) across all registered scopes.\n';
	}
	const lines: string[] = [
		`check-agent-md: ${drifts.length} drift(s) detected.`,
		'',
		'  Run `bun run gen:agent-md` to refresh.',
		'',
	];
	for (const drift of drifts) {
		lines.push(`  ${drift.relPath}`);
		lines.push(
			`    on-disk: ${drift.onDiskLen}B; refreshed: ${drift.refreshedLen}B; first divergence @ ${drift.firstDivergence}`,
		);
	}
	return `${lines.join('\n')}\n`;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	void argv;
	if (argv.includes('--force-write')) {
		const touched = await generateAll();
		process.stdout.write(
			`check-agent-md --force-write: wrote ${touched.length} file(s).\n`,
		);
		return 0;
	}
	const drifts = await detectAgentMdDrift();
	process.stdout.write(formatReport(drifts));
	return drifts.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
