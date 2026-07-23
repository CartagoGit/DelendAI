/**
 * audit.ts — f00136 S1 / r00012 consumer: dependency CVE scanning via
 * `bun audit --json`, normalized into the shared `IFinding`/`IScanResult`
 * shape. The parser is pure (unit-tested on a real advisory fixture); the
 * runner composes the shared `runExternalTool` seam, so this file spawns
 * nothing directly and stays fully testable with an injected exec.
 *
 * Network-gated by the caller (registered only under `allowNetwork: true`,
 * exactly like `deps_outdated`) — `bun audit` queries the advisory registry.
 */
import { runExternalTool, toScanResult } from '@mcp-vertex/core/public';
import type {
	FindingSeverity,
	IArgvExec,
	IExternalTool,
	IFinding,
	IScanResult,
} from '@mcp-vertex/core/public';

/** One advisory entry as emitted by `bun audit --json`. */
interface IBunAdvisory {
	readonly id?: number;
	readonly url?: string;
	readonly title?: string;
	readonly severity?: string;
	readonly vulnerable_versions?: string;
}

/** The `bun` binary as an external-tool descriptor (probe/install hint). */
const BUN_TOOL: IExternalTool = {
	id: 'bun-audit',
	bin: 'bun',
	installHints: [
		{
			manager: 'curl',
			command: 'curl -fsSL https://bun.sh/install | bash',
		},
		{ manager: 'npm', command: 'npm install -g bun' },
	],
};

const GHSA_RE = /GHSA-[0-9a-z-]+/i;

/** Map a bun/npm advisory severity onto the shared 5-band scale. */
const mapSeverity = (raw: string | undefined): FindingSeverity => {
	switch ((raw ?? '').toLowerCase()) {
		case 'critical':
			return 'critical';
		case 'high':
			return 'high';
		case 'moderate':
		case 'medium':
			return 'medium';
		case 'low':
			return 'low';
		default:
			return 'info';
	}
};

/**
 * Parse `bun audit --json` output — a `Record<packageName, advisory[]>` —
 * into normalized findings. Pure and defensive: tolerates a leading banner
 * or trailing text (slices between the first `{` and last `}`) and never
 * throws (malformed input → `[]`).
 */
export const parseBunAudit = (raw: string): IFinding[] => {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end < start) return [];
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
	} catch {
		return [];
	}
	if (data === null || typeof data !== 'object') return [];
	const findings: IFinding[] = [];
	for (const [pkg, value] of Object.entries(data)) {
		if (!Array.isArray(value)) continue;
		for (const advisory of value as IBunAdvisory[]) {
			const ghsa = advisory.url
				? (GHSA_RE.exec(advisory.url)?.[0] ?? undefined)
				: undefined;
			const ruleId =
				ghsa ??
				(advisory.id !== undefined
					? `advisory-${advisory.id}`
					: `vuln-${pkg}`);
			const range = advisory.vulnerable_versions
				? ` (vulnerable ${advisory.vulnerable_versions})`
				: '';
			findings.push({
				ruleId,
				severity: mapSeverity(advisory.severity),
				message: `${pkg}: ${advisory.title ?? 'known vulnerability'}${range}`,
				...(advisory.url !== undefined
					? { fix: `Review ${advisory.url} and upgrade ${pkg}` }
					: {}),
			});
		}
	}
	return findings;
};

/**
 * Run `bun audit --json` in `cwd` and normalize the result. `exec` is
 * injected (defaults to the real runner inside `runExternalTool`) so this is
 * unit-testable without spawning. `bun audit` exits non-zero when it finds
 * vulnerabilities — that is a normal result here, not a failure; only a
 * missing `bun` binary yields a skipped scan.
 */
export const runDepsAudit = async (
	cwd: string,
	exec?: IArgvExec,
): Promise<IScanResult> => {
	const run = await runExternalTool(
		{ tool: BUN_TOOL, args: ['audit', '--json'], cwd, timeoutMs: 60_000 },
		exec,
	);
	if (run.unavailable) {
		return toScanResult('bun-audit', [], {
			skipped: true,
			note: 'bun not found on PATH — install bun to run a CVE audit',
		});
	}
	const raw = run.stdout.includes('{') ? run.stdout : run.stderr;
	return toScanResult('bun-audit', parseBunAudit(raw));
};
