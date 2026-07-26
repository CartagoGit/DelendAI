/**
 * run-lint.ts — f00133 S2: orchestrator for Dockerfile lint.
 */
import { spawn } from 'node:child_process';

import type { IFinding, IProbeDeps } from '@mcp-vertex/core/public';
import { probeTool, realProbeDeps } from '@mcp-vertex/core/public';

import { HADO_LINT_TOOL } from '../inspect/cli-tools';
import type { IDockerfileInstruction } from './dockerfile-parser';
import { lintDockerfile } from './dockerfile-rules';
import { parseDockerfile } from './dockerfile-parser';

export interface IRunDockerfileLintInput {
	readonly source: string;
	readonly hadolintPath?: string;
	readonly probeDeps?: IProbeDeps;
}

export interface IRunDockerfileLintOutput {
	readonly findings: readonly IFinding[];
	readonly engine: 'hadolint' | 'builtin' | 'builtin-hadolint-failed';
	readonly hadolintAvailable: boolean;
}

const SEVERITY_MAP: Readonly<Record<string, IFinding['severity']>> = {
	error: 'critical',
	warning: 'high',
	info: 'medium',
	style: 'low',
};

const fromHadolintJson = (
	raw: string,
): { findings: readonly IFinding[]; ok: boolean } => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { findings: [], ok: false };
	}
	if (!Array.isArray(parsed)) return { findings: [], ok: false };
	const findings: IFinding[] = [];
	for (const item of parsed) {
		if (typeof item !== 'object' || item === null) continue;
		const row = item as Record<string, unknown>;
		const level = String(row['level'] ?? 'info');
		const severity = SEVERITY_MAP[level] ?? 'info';
		const message = String(row['message'] ?? '');
		const code = String(row['code'] ?? 'unknown');
		const lineRaw = row['line'];
		const line =
			typeof lineRaw === 'number' && Number.isFinite(lineRaw)
				? lineRaw
				: 1;
		findings.push({
			ruleId: `dockerfile/${code}`,
			severity,
			message,
			location: { file: 'Dockerfile', line },
		});
	}
	return { findings, ok: true };
};

const runHadolint = async (
	source: string,
	hadolintPath: string,
): Promise<string> =>
	new Promise<string>((resolve, reject) => {
		const child = spawn(hadolintPath, ['--format', 'json', '-'], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(stdout).toString('utf8'));
			} else {
				reject(
					new Error(
						`hadolint exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`,
					),
				);
			}
		});
		child.stdin.write(source);
		child.stdin.end();
	});

export const runDockerfileLint = async (
	input: IRunDockerfileLintInput,
): Promise<IRunDockerfileLintOutput> => {
	const probe = await probeTool(
		HADO_LINT_TOOL,
		input.probeDeps ?? realProbeDeps(),
	);
	const builtins = lintDockerfile(parseDockerfile(input.source));
	if (!probe.available) {
		return {
			findings: builtins,
			engine: 'builtin',
			hadolintAvailable: false,
		};
	}
	const hadolintBin = input.hadolintPath ?? HADO_LINT_TOOL.bin;
	try {
		const raw = await runHadolint(input.source, hadolintBin);
		const parsed = fromHadolintJson(raw);
		if (!parsed.ok) {
			return {
				findings: builtins,
				engine: 'builtin-hadolint-failed',
				hadolintAvailable: true,
			};
		}
		const seen = new Set(parsed.findings.map((f) => f.ruleId));
		const merged = [
			...parsed.findings,
			...builtins.filter((f) => !seen.has(f.ruleId)),
		];
		return {
			findings: merged,
			engine: 'hadolint',
			hadolintAvailable: true,
		};
	} catch {
		return {
			findings: builtins,
			engine: 'builtin-hadolint-failed',
			hadolintAvailable: true,
		};
	}
};

export { parseDockerfile, lintDockerfile };
export type { IDockerfileInstruction };
