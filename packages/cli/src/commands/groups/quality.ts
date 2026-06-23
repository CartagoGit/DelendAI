/**
 * f00046 S4 — quality commands. One subcommand per `quality_*` MCP tool.
 * Mostly 1:1 delegation; `run` and `run-all` additionally map the tool's
 * pass/fail report onto the process exit code (VALIDATION when a scope
 * fails) so CI can branch on `$?`, while `--json` always returns the
 * full structured report for parsing.
 *
 * Tools mapped:
 *   - `quality_get_quality_scopes` (no args)
 *   - `quality_run_quality`        ({ scope? })
 *   - `quality_quality_cancel`     ({ pid? })
 *   - `quality_quality_run_all`    (no args)
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { data, numberArg, request, scalarArg } from './group-helpers';

/** A quality report is "failed" when its global summary is not ok. */
const failed = (report: unknown): boolean => {
	if (typeof report !== 'object' || report === null) return false;
	const r = report as {
		summary?: { ok?: boolean };
		ok?: boolean;
		commands?: Array<{ ok?: boolean }>;
	};
	if (r.summary?.ok === false) return true;
	if (r.ok === false) return true;
	if (Array.isArray(r.commands))
		return r.commands.some((c) => c.ok === false);
	return false;
};

const codeFor = (report: unknown): ICliCommandResult['code'] =>
	failed(report) ? EXIT_CODE.VALIDATION : EXIT_CODE.OK;

const qualityScopesCommand: ICliCommand = {
	name: 'quality scopes',
	summary: 'List the quality-gate scopes and the commands each runs.',
	async run(_args, ctx) {
		return data(await request(ctx, 'quality_get_quality_scopes', {}));
	},
};

const qualityRunCommand: ICliCommand = {
	name: 'quality run',
	summary: "Execute a quality scope's commands and report pass/fail.",
	async run(args, ctx) {
		const scope = scalarArg(args, 'scope');
		const report = await request(ctx, 'quality_run_quality', {
			...(scope !== undefined ? { scope } : {}),
		});
		return data(report, codeFor(report));
	},
};

const qualityCancelCommand: ICliCommand = {
	name: 'quality cancel',
	summary: 'Abort quality commands currently running in the server.',
	async run(args, ctx) {
		const pid = numberArg(args, 'pid');
		return data(
			await request(ctx, 'quality_quality_cancel', {
				...(pid !== undefined ? { pid } : {}),
			}),
		);
	},
};

const qualityRunAllCommand: ICliCommand = {
	name: 'quality run-all',
	summary: 'Run every configured quality scope and aggregate the report.',
	async run(_args, ctx) {
		const report = await request(ctx, 'quality_quality_run_all', {});
		return data(report, codeFor(report));
	},
};

export const qualityCommands: readonly ICliCommand[] = [
	qualityScopesCommand,
	qualityRunCommand,
	qualityCancelCommand,
	qualityRunAllCommand,
];
