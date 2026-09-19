/**
 * `delendai repair` — record the conclusion of an investigation a boot
 * could not perform.
 *
 * WHY it lives in the CLI and touches no database: the decisions it
 * records answer blockers derived from git, so they are raised on every
 * clone and must travel with the repository. The store is therefore a
 * tracked JSON file, and a command that only reads and writes that file
 * needs no MCP server, no SQLite driver and no host — a console, Claude,
 * Codex and Copilot all reach it the same way.
 *
 * WHY recording demands an evidence digest and a reason: a resolution is
 * an answer to ONE observation, not a switch that turns a class of
 * findings off. The digest the boot report prints is what ties the two
 * together, and it stops answering automatically when the evidence
 * changes.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import {
	parseRepairResolutions,
	REPAIR_DECISIONS,
	REPAIR_RESOLUTIONS_PATH,
	renderRepairResolutions,
	type IRepairDecision,
	type IRepairResolution,
} from '@delendai/core/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { scalarArg } from '../lib/helpers/cli-command.helper';

const workspaceOf = (
	ctx: ICliCommandContext,
	args: readonly string[],
): string => scalarArg(args, 'workspace') ?? ctx.cwd;

const filePathFor = (workspaceRoot: string): string =>
	isAbsolute(REPAIR_RESOLUTIONS_PATH)
		? REPAIR_RESOLUTIONS_PATH
		: join(workspaceRoot, REPAIR_RESOLUTIONS_PATH);

const readResolutions = async (
	path: string,
): Promise<{
	readonly resolutions: readonly IRepairResolution[];
	readonly errors: readonly string[];
}> => {
	try {
		return parseRepairResolutions(await readFile(path, 'utf8'));
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? String((error as { code?: unknown }).code)
				: '';
		if (code === 'ENOENT') return { resolutions: [], errors: [] };
		throw error;
	}
};

const readDecision = (value: string | undefined): IRepairDecision | undefined =>
	REPAIR_DECISIONS.find((decision) => decision === value);

const listed = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const path = filePathFor(workspaceOf(ctx, args));
	const { resolutions, errors } = await readResolutions(path);
	const payload = { path, resolutions, errors };
	// An entry that could not be read is a decision that is NOT in force:
	// listing exits non-zero so a script notices, in both output shapes.
	const code = errors.length > 0 ? EXIT_CODE.VALIDATION : EXIT_CODE.OK;
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code, data: payload };
	}
	const rows =
		resolutions.length === 0
			? ['No repair resolutions are recorded.']
			: resolutions.map(
					(entry) =>
						`${entry.taskId}  ${entry.decision}  by ${entry.decidedBy} on ${entry.decidedAt}\n    evidence ${entry.evidenceDigest}\n    ${entry.reason}`,
				);
	process.stdout.write(
		`${[`${path}`, ...rows, ...errors.map((reason) => `IGNORED: ${reason}`)].join('\n')}\n`,
	);
	return { code, data: payload, suppressDefaultPrint: true };
};

const resolved = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const taskId = args[1];
	const evidenceDigest = scalarArg(args, 'evidence');
	const reason = scalarArg(args, 'reason');
	const decision = readDecision(scalarArg(args, 'decision'));
	const decidedBy = scalarArg(args, 'by') ?? process.env.DELENDAI_AGENT_ID;
	if (
		taskId === undefined ||
		taskId.startsWith('--') ||
		evidenceDigest === undefined ||
		reason === undefined ||
		decision === undefined ||
		decidedBy === undefined
	) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: `repair resolve <task-id> --evidence=<digest> --decision=<${REPAIR_DECISIONS.join('|')}> --reason="..." [--by=<who>]. The boot report prints the task id and its evidence digest; --by defaults to DELENDAI_AGENT_ID.`,
		};
	}
	const path = filePathFor(workspaceOf(ctx, args));
	const { resolutions, errors } = await readResolutions(path);
	if (errors.length > 0) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: `${path} has entries that cannot be read; fix them before recording another decision: ${errors.join('; ')}`,
		};
	}
	const entry: IRepairResolution = {
		taskId,
		evidenceDigest,
		decision,
		reason,
		decidedBy,
		decidedAt: new Date().toISOString(),
	};
	// One decision per (task, evidence): recording again supersedes the
	// previous answer to the SAME observation and never accumulates
	// contradictory records of it.
	const kept = resolutions.filter(
		(existing) =>
			existing.taskId !== taskId ||
			existing.evidenceDigest !== evidenceDigest,
	);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, renderRepairResolutions([...kept, entry]), 'utf8');
	return {
		code: EXIT_CODE.OK,
		data: { path, recorded: entry, total: kept.length + 1 },
	};
};

const forgotten = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const taskId = args[1];
	if (taskId === undefined || taskId.startsWith('--')) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: 'repair forget <task-id> [--workspace=<path>]',
		};
	}
	const path = filePathFor(workspaceOf(ctx, args));
	const { resolutions } = await readResolutions(path);
	const kept = resolutions.filter((entry) => entry.taskId !== taskId);
	if (kept.length === resolutions.length) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: `No resolution is recorded for ${taskId}.`,
		};
	}
	await writeFile(path, renderRepairResolutions(kept), 'utf8');
	return {
		code: EXIT_CODE.OK,
		data: { path, removed: resolutions.length - kept.length },
	};
};

export const createRepairCommand = (): ICliCommand => ({
	name: 'repair',
	summary:
		'List and record the human decisions that close startup repair tasks the reconciler may not close.',
	usage: 'repair <list|resolve|forget> [task-id] [--evidence=<digest>] [--decision=<kind>] [--reason=<text>] [--by=<who>] [--workspace=<path>]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const sub = args[0];
		if (sub === 'list' || sub === undefined) return listed(args, ctx);
		if (sub === 'resolve') return resolved(args, ctx);
		if (sub === 'forget') return forgotten(args, ctx);
		return {
			code: EXIT_CODE.VALIDATION,
			error: `Unknown subcommand '${sub}'. Use list, resolve or forget.`,
		};
	},
});

export const repairCommand: ICliCommand = createRepairCommand();
