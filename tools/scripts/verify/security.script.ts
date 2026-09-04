#!/usr/bin/env bun
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarizeFindings, type IFinding } from '@delendai/core/public';

import { parseAuditJson, runAuditCommand } from '@delendai/security/public';
import {
	detectStack,
	runSastRunner,
	SAST_RULES,
} from '@delendai/security/public';
import { realScanDeps, runSecretScan } from '@delendai/security/public';

// Lazy REPO_ROOT: resolved on first access so vitest can import this
// module without choking on `import.meta.dir` (bun extension) under the
// test harness. We use `import.meta.url` + `fileURLToPath` so the script
// behaves identically under bun, vitest, and node.
const here = (): string => dirname(fileURLToPath(import.meta.url));
const repoRoot = (): string => resolve(here(), '../..');
const baselinePath = (): string =>
	join(repoRoot(), '.cache/security/baseline.json');

type PackageManager = 'bun' | 'npm' | 'yarn';

export interface ISecurityBaseline {
	readonly criticals: readonly string[];
}

export interface ISecurityGateResult {
	readonly ok: boolean;
	readonly skipped: boolean;
	readonly findings: readonly IFinding[];
	readonly newCriticals: readonly IFinding[];
	readonly baselineCriticals: readonly string[];
	readonly summary: ReturnType<typeof summarizeFindings>;
	readonly note?: string;
}

export interface IVerifySecurityDeps {
	readonly readBaseline?: (path: string) => Promise<string | undefined>;
	readonly runSecrets?: (cwd: string) => Promise<readonly IFinding[]>;
	readonly runDeps?: (cwd: string) => Promise<readonly IFinding[]>;
	readonly runSast?: (cwd: string) => Promise<readonly IFinding[]>;
}

const criticalSignature = (finding: IFinding): string =>
	[
		finding.ruleId,
		finding.location?.file ?? 'unknown',
		String(finding.location?.line ?? 0),
		finding.message,
	].join('::');

const detectPackageManager = async (cwd: string): Promise<PackageManager> => {
	const probes: ReadonlyArray<readonly [string, PackageManager]> = [
		['bun.lock', 'bun'],
		['bun.lockb', 'bun'],
		['package-lock.json', 'npm'],
		['yarn.lock', 'yarn'],
	];
	for (const [file, kind] of probes) {
		try {
			await access(join(cwd, file));
			return kind;
		} catch {
			// keep probing
		}
	}
	return 'bun';
};

export const loadSecurityBaseline = async (
	path = baselinePath(),
	reader: (path: string) => Promise<string | undefined> = async (target) => {
		try {
			return await readFile(target, 'utf8');
		} catch {
			return undefined;
		}
	},
): Promise<ISecurityBaseline | undefined> => {
	const raw = await reader(path);
	if (raw === undefined) return undefined;
	const parsed = JSON.parse(raw) as { criticals?: unknown };
	return {
		criticals: Array.isArray(parsed.criticals)
			? parsed.criticals.filter(
					(entry): entry is string => typeof entry === 'string',
				)
			: [],
	};
};

const realSecrets = async (cwd: string): Promise<readonly IFinding[]> =>
	(
		await runSecretScan(realScanDeps(cwd), {
			scope: 'tracked',
			includeTests: false,
		})
	).findings;

const realDeps = async (cwd: string): Promise<readonly IFinding[]> => {
	const packageManager = await detectPackageManager(cwd);
	const audit = await runAuditCommand({ cwd, packageManager });
	if (!audit.ok) return [];
	return parseAuditJson(audit.raw, { ecosystem: packageManager });
};

const realSast = async (cwd: string): Promise<readonly IFinding[]> => {
	const stack = await detectStack(cwd);
	return (
		await runSastRunner({
			cwd,
			rules: SAST_RULES,
			languages: stack.languages,
			files: stack.files,
		})
	).findings;
};

export const verifySecurityGate = async (
	cwd = repoRoot(),
	deps: IVerifySecurityDeps = {},
): Promise<ISecurityGateResult> => {
	const baseline = await loadSecurityBaseline(
		baselinePath(),
		deps.readBaseline,
	);
	const [secretFindings, depFindings, sastFindings] = await Promise.all([
		(deps.runSecrets ?? realSecrets)(cwd),
		(deps.runDeps ?? realDeps)(cwd),
		(deps.runSast ?? realSast)(cwd),
	]);
	const findings = [...secretFindings, ...depFindings, ...sastFindings];
	const summary = summarizeFindings(findings);
	if (baseline === undefined) {
		return {
			ok: true,
			skipped: true,
			findings,
			newCriticals: [],
			baselineCriticals: [],
			summary,
			note: `No baseline at ${baselinePath()}; skipping new-critical gate.`,
		};
	}
	const seen = new Set(baseline.criticals);
	const newCriticals = findings.filter(
		(finding) =>
			finding.severity === 'critical' &&
			!seen.has(criticalSignature(finding)),
	);
	return {
		ok: newCriticals.length === 0,
		skipped: false,
		findings,
		newCriticals,
		baselineCriticals: baseline.criticals,
		summary,
		...(newCriticals.length === 0
			? { note: 'No new critical findings.' }
			: {}),
	};
};

const formatFinding = (finding: IFinding): string =>
	`${finding.severity.toUpperCase()} ${finding.ruleId} ${finding.location?.file ?? 'unknown'}:${finding.location?.line ?? 0} ${finding.message}`;

const main = async (): Promise<void> => {
	const result = await verifySecurityGate(repoRoot());
	const lines = [
		result.ok ? 'security gate: pass' : 'security gate: fail',
		`summary critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low} info=${result.summary.info}`,
	];
	if (result.note !== undefined) lines.push(result.note);
	if (result.newCriticals.length > 0) {
		lines.push('new critical findings:');
		for (const finding of result.newCriticals) {
			lines.push(`- ${formatFinding(finding)}`);
		}
	}
	process.stdout.write(`${lines.join('\n')}\n`);
	if (!result.ok) process.exitCode = 1;
};

if (import.meta.main) {
	void main();
}
