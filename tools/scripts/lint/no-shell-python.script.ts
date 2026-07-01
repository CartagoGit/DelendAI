#!/usr/bin/env bun
/**
 * no-shell-python.script.ts — f00025 s5 (gate).
 *
 * Hard rule (AGENTS.md bullet 9): the `tools/` and `scripts/` directories
 * are TypeScript-exclusive. Any `.py`, `.sh`, `.bash`, `.zsh`, `.pl`, `.rb`
 * inside them is a policy violation. This script is the automated gate:
 * `bun run lint:tools` exits 0 when clean, 1 with a per-violation report
 * when not.
 *
 * Architecture (SOLID):
 *   - `IForbiddenExtension` (interface) — single source of truth for what
 *     counts as a violation and the reason humans should see.
 *   - `IDetection` (interface) — one row in the report.
 *   - `scanForForbidden(rootDir)` (pure engine) — walks the tree, returns
 *     findings. No I/O outside `readdir`. Unit-testable in isolation.
 *   - `formatReport(findings)` (pure formatter) — turns findings into the
 *     human-readable text printed to stderr.
 *   - `main()` (CLI shell) — parses args, calls engine, formats, exits.
 *   - `process.exit(await main())` — module entrypoint.
 *
 * Usage: `bun tools/scripts/lint/no-shell-python.script.ts`
 *   --root <dir>     override the scan root (default: repo root via cwd)
 *   --strict         exit 1 even when the repo is clean (smoke test)
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

/** A single forbidden extension and the human-readable reason it is forbidden. */
export interface IForbiddenExtension {
	readonly ext: string;
	readonly reason: string;
}

/** One finding: a forbidden file under one of the scanned roots. */
export interface IDetection {
	readonly absPath: string;
	readonly relPath: string;
	readonly forbidden: IForbiddenExtension;
}

/** The single source of truth for the policy. Add to this list and the engine picks it up. */
export const FORBIDDEN_EXTENSIONS: readonly IForbiddenExtension[] = [
	{ ext: '.py', reason: 'Python is not part of the bun/TS toolchain' },
	{ ext: '.sh', reason: 'Shell is not part of the bun/TS toolchain' },
	{ ext: '.bash', reason: 'Bash is not part of the bun/TS toolchain' },
	{ ext: '.zsh', reason: 'Zsh is not part of the bun/TS toolchain' },
	{ ext: '.pl', reason: 'Perl is not part of the bun/TS toolchain' },
	{ ext: '.rb', reason: 'Ruby is not part of the bun/TS toolchain' },
	{ ext: '.pyc', reason: 'Compiled Python bytecode must not be tracked' },
];

/** Directories this gate scans. Anything outside is ignored by design. */
export const SCAN_ROOTS: readonly string[] = ['tools', 'scripts'];

/** Pure engine. Recursively walks each scan root, matches by extension. No side effects. */
export const scanForForbidden = async (
	roots: readonly string[] = SCAN_ROOTS,
): Promise<readonly IDetection[]> => {
	const findings: IDetection[] = [];
	for (const root of roots) {
		const absRoot = join(REPO_ROOT, root);
		await walk(absRoot, findings);
	}
	return findings;
};

const walk = async (dir: string, accumulator: IDetection[]): Promise<void> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walk(abs, accumulator);
		} else if (entry.isFile()) {
			const forbidden = FORBIDDEN_EXTENSIONS.find((f) =>
				entry.name.endsWith(f.ext),
			);
			if (forbidden) {
				accumulator.push({
					absPath: abs,
					relPath: relative(REPO_ROOT, abs),
					forbidden,
				});
			}
		}
	}
};

/** Pure formatter. Builds the human-readable report. */
export const formatReport = (findings: readonly IDetection[]): string => {
	if (findings.length === 0) {
		return '✓ no-shell-python: tools/ and scripts/ are TypeScript-exclusive (no .py/.sh/.bash/.zsh/.pl/.rb/.pyc found).\n';
	}
	const lines: string[] = [
		`✗ no-shell-python: ${findings.length} forbidden file${findings.length === 1 ? '' : 's'} found:\n`,
	];
	for (const f of findings) {
		lines.push(
			`  ${f.relPath}  (${f.forbidden.ext} — ${f.forbidden.reason})`,
		);
	}
	lines.push(
		'',
		'AGENTS.md bullet 9: tools/ and scripts/ are TypeScript-only.',
		'Port to TS (shebang `#!/usr/bin/env bun` + `process.exit(await main())`)',
		'or move the file under a plugin that explicitly allows its language.',
	);
	return `${lines.join('\n')}\n`;
};

interface ICliArgs {
	readonly strict: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let strict = false;
	for (const arg of argv) {
		if (arg === '--strict') {
			strict = true;
		}
	}
	return { strict };
};

const main = async (): Promise<number> => {
	parseArgs(process.argv.slice(2));
	const findings = await scanForForbidden();
	const report = formatReport(findings);
	if (findings.length === 0) {
		process.stdout.write(report);
		// `--strict` is a smoke-test flag: the gate ran, the gate is wired,
		// but we want to verify the wiring by failing on demand. Useful for
		// CI matrix tests and for the AGENTS.md unit spec.
		return parseArgs(process.argv.slice(2)).strict ? 1 : 0;
	}
	process.stderr.write(report);
	return 1;
};

process.exit(await main());
