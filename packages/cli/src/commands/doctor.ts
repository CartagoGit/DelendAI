import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { computeScore, type IDoctorScore } from '../lib/doctor/score';
import type {
	DoctorSectionStatus,
	IDoctorCheckContext,
	IDoctorFs,
	IDoctorSection,
} from '../lib/doctor/types';
import { data } from '../lib/helpers/cli-command.helper';
import { checkBranchProtection } from './doctor-checks/branch-protection';
import { checkCiStatus } from './doctor-checks/ci-status';
import { checkConfig } from './doctor-checks/config';
import { checkDeps } from './doctor-checks/deps';
import { checkGitStatus } from './doctor-checks/git-status';
import { checkManifests } from './doctor-checks/manifests';
import { checkMcpHandshake } from './doctor-checks/mcp-handshake';
import { checkPermissions } from './doctor-checks/permissions';
import { checkPluginGraph } from './doctor-checks/plugin-graph';
import { checkPorts } from './doctor-checks/ports';
import { checkRuntime } from './doctor-checks/runtime';
import { checkSchemas } from './doctor-checks/schemas';
import { checkStaleDocs } from './doctor-checks/stale-docs';
import { checkTokenBudgets } from './doctor-checks/token-budgets';

const DOCTOR_ERROR_CODE = 1 as ICliCommandResult['code'];
const DOCTOR_WARN_CODE = EXIT_CODE.USAGE;

export interface IDoctorCommandCheckContext extends IDoctorCheckContext {
	readonly cli: ICliCommandContext;
}

export type IDoctorCommandCheck = (
	ctx: IDoctorCommandCheckContext,
) => Promise<IDoctorSection>;

export interface IRunDoctorOptions {
	readonly checks?: readonly IDoctorCommandCheck[];
	readonly extraChecks?: readonly IDoctorCommandCheck[];
	readonly fs?: IDoctorFs;
	readonly now?: () => Date;
}

export const defaultDoctorChecks: readonly IDoctorCommandCheck[] = [
	checkConfig,
	checkManifests,
	checkPluginGraph,
	checkDeps,
	checkTokenBudgets,
	checkBranchProtection,
	checkGitStatus,
	checkRuntime,
	checkMcpHandshake,
	checkStaleDocs,
	checkSchemas,
	checkPorts,
	checkPermissions,
	checkCiStatus,
];

const createDoctorFs = (workspace: string): IDoctorFs => ({
	fileExists: async (relPath) => {
		try {
			await access(join(workspace, relPath), constants.F_OK);
			return true;
		} catch {
			return false;
		}
	},
	readFile: async (relPath) => {
		try {
			return await readFile(join(workspace, relPath), 'utf8');
		} catch {
			return undefined;
		}
	},
	listDirs: async (relPath) => {
		try {
			return await readdir(join(workspace, relPath));
		} catch {
			return [];
		}
	},
});

const rollupDoctorStatus = (
	sections: readonly IDoctorSection[],
): DoctorSectionStatus => {
	if (sections.some((section) => section.status === 'error')) return 'error';
	if (sections.some((section) => section.status === 'warn')) return 'warn';
	return 'ok';
};

const doctorExitCode = (score: IDoctorScore): ICliCommandResult['code'] => {
	if (score.p0.length > 0) return DOCTOR_ERROR_CODE;
	if (score.p1.length > 0) return DOCTOR_WARN_CODE;
	return EXIT_CODE.OK;
};

export const renderDoctorSummary = (
	status: DoctorSectionStatus,
	sections: readonly IDoctorSection[],
	score: IDoctorScore,
): string => {
	const lines: string[] = [
		`Health: ${score.value}/100`,
		'',
		`doctor: ${status}`,
		'',
	];
	for (const section of sections) {
		lines.push(`  ${section.name} (${section.status})`);
		for (const finding of section.findings) lines.push(`    ${finding}`);
	}
	lines.push('', 'P0 (must fix):');
	lines.push(score.p0.length === 0 ? '  none' : `  ${score.p0.join('\n  ')}`);
	lines.push('P1 (should fix):');
	lines.push(score.p1.length === 0 ? '  none' : `  ${score.p1.join('\n  ')}`);
	lines.push('P2 (cosmetic):');
	lines.push(score.p2.length === 0 ? '  none' : `  ${score.p2.join('\n  ')}`);
	lines.push('');
	return lines.join('\n');
};

export const runDoctorBody = async (
	ctx: ICliCommandContext,
	options: IRunDoctorOptions = {},
): Promise<ICliCommandResult> => {
	const doctorContext: IDoctorCommandCheckContext = {
		cli: ctx,
		workspace: ctx.globals.workspace,
		fs: options.fs ?? createDoctorFs(ctx.globals.workspace),
		now: options.now ?? (() => new Date()),
	};
	const checks = options.checks ?? options.extraChecks ?? defaultDoctorChecks;
	const sections: IDoctorSection[] = [];
	for (const check of checks) {
		try {
			sections.push(await check(doctorContext));
		} catch (error) {
			sections.push({
				name: 'check-failure',
				status: 'error',
				findings: [
					error instanceof Error
						? error.message
						: 'unknown doctor check failure',
				],
			});
		}
	}
	const status = rollupDoctorStatus(sections);
	const score = computeScore(sections);
	if (!ctx.globals.json && ctx.globals.format !== 'json') {
		process.stderr.write(renderDoctorSummary(status, sections, score));
	}
	return data({ status, sections, score }, doctorExitCode(score));
};

export const doctorCommand: ICliCommand = {
	name: 'doctor',
	summary:
		'Run local DelendAI health checks and print a scored report with JSON support.',
	async run(_args, ctx) {
		return runDoctorBody(ctx);
	},
};

export const doctorCommands: readonly ICliCommand[] = [doctorCommand];
