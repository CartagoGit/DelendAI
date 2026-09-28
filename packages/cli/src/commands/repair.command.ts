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
import { execFileSync } from 'node:child_process';
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
import { readWorkspacePolicy } from '@delendai/core/cli';
import { scalarArg } from '../lib/helpers/cli-command.helper';

/**
 * `--workspace` is a global flag: the parser consumes it before a command
 * sees its arguments. Read from `args`, it was never there, and a decision
 * meant for a repair unit was refused as a write to the shared checkout.
 */
const workspaceOf = (ctx: ICliCommandContext): string =>
	ctx.globals.workspace.length > 0 ? ctx.globals.workspace : ctx.cwd;

/**
 * A decision is a tracked file that reaches the integration branch by a
 * pull request. Written into a shared checkout the policy pins, it was a
 * loose edit on the integration branch that blocked the next hydration
 * (x00689). The command says where to record it instead.
 */
const sharedCheckoutRefusal = async (
	workspaceRoot: string,
): Promise<ICliCommandResult | undefined> => {
	const gitPath = (flag: string): string | undefined => {
		try {
			return execFileSync(
				'git',
				['rev-parse', '--path-format=absolute', flag],
				{
					cwd: workspaceRoot,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore'],
				},
			).trim();
		} catch {
			return undefined;
		}
	};
	const gitDir = gitPath('--git-dir');
	if (gitDir === undefined || gitDir !== gitPath('--git-common-dir')) {
		return undefined;
	}
	const policy = await readWorkspacePolicy(workspaceRoot).catch(
		() => undefined,
	);
	if (policy?.workspace.pinnedCheckout !== true) return undefined;
	return {
		code: EXIT_CODE.VALIDATION,
		error: [
			`This is the shared checkout, which stays on \`${policy.branches.integration}\`: a decision written here is a loose edit on the integration branch.`,
			'Record it in a repair unit and publish it:',
			'  delendai work enter --kind=repair --proposal=batch --slice=all --agent=<you> --topic=<what>',
			'  delendai repair resolve … --workspace=<the path work enter printed>',
			'  (commit there) delendai work publish --kind=repair --proposal=batch --slice=all --agent=<you> --topic=<what>',
		].join('\n'),
	};
};

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

const listed = async (ctx: ICliCommandContext): Promise<ICliCommandResult> => {
	const path = filePathFor(workspaceOf(ctx));
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
	const refusal = await sharedCheckoutRefusal(workspaceOf(ctx));
	if (refusal !== undefined) return refusal;
	const path = filePathFor(workspaceOf(ctx));
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
	const refusal = await sharedCheckoutRefusal(workspaceOf(ctx));
	if (refusal !== undefined) return refusal;
	const path = filePathFor(workspaceOf(ctx));
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
		if (sub === 'list' || sub === undefined) return listed(ctx);
		if (sub === 'resolve') return resolved(args, ctx);
		if (sub === 'forget') return forgotten(args, ctx);
		return {
			code: EXIT_CODE.VALIDATION,
			error: `Unknown subcommand '${sub}'. Use list, resolve or forget.`,
		};
	},
});

export const repairCommand: ICliCommand = createRepairCommand();
