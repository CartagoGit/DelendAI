/**
 * f00046 S9 — conventions commands. Consumer-facing surface over the
 * `@mcp-vertex/conventions` plugin built in f00037 S3.
 *
 * `check` delegates to `conventions_check` (workspace drift report).
 * `plan` frames the same drift as the migration backlog. `apply` is
 * guarded: the plugin intentionally does NOT auto-rename files (renames
 * need per-file target inference, deferred), so `apply` reports the
 * outstanding violations and fails with VALIDATION unless `--dry-run`.
 *
 * The TypeScript profile is the only one implemented; any other
 * `--profile` is rejected with a clear message (the language signals it
 * would need are not present / not supported), satisfying the
 * "reject non-TypeScript profile" contract.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { data, hasFlag, listArg, request, scalarArg } from './group-helpers';

/** Only the `typescript` profile is implemented; reject anything else. */
const rejectProfile = (
	profile: string | undefined,
): ICliCommandResult | undefined => {
	if (profile === undefined || profile === 'typescript') return undefined;
	return {
		code: EXIT_CODE.VALIDATION,
		error: `profile "${profile}" is not supported — only "typescript" is implemented (no ${profile} language signals to drive a profile).`,
	};
};

interface ICheckResult {
	readonly ok?: boolean;
	readonly unmatchedCount?: number;
	readonly unmatched?: readonly string[];
}

const runCheck = (
	args: readonly string[],
	ctx: Parameters<ICliCommand['run']>[1],
) => {
	const roots = listArg(args, 'roots');
	return request<ICheckResult>(ctx, 'conventions_check', {
		...(roots !== undefined ? { roots } : {}),
	});
};

const checkCommand: ICliCommand = {
	name: 'conventions check',
	summary:
		'Report file-convention drift (per-role counts + unmatched files).',
	async run(args, ctx) {
		const rejected = rejectProfile(scalarArg(args, 'profile'));
		if (rejected !== undefined) return rejected;
		return data(await runCheck(args, ctx));
	},
};

const planCommand: ICliCommand = {
	name: 'conventions plan',
	summary: 'List the files that need a canonical rename (migration backlog).',
	async run(args, ctx) {
		const rejected = rejectProfile(scalarArg(args, 'profile'));
		if (rejected !== undefined) return rejected;
		const report = await runCheck(args, ctx);
		return data({
			profile: 'typescript',
			toMigrate: report.unmatched ?? [],
			count: report.unmatchedCount ?? 0,
			note: 'Each listed file needs a canonical suffix/folder; targets are decided per-file (no blind auto-rename).',
		});
	},
};

const applyCommand: ICliCommand = {
	name: 'conventions apply',
	summary: 'Guarded apply: reports outstanding violations (no blind rename).',
	async run(args, ctx) {
		const rejected = rejectProfile(scalarArg(args, 'profile'));
		if (rejected !== undefined) return rejected;
		const report = await runCheck(args, ctx);
		const count = report.unmatchedCount ?? 0;
		const dryRun = hasFlag(args, 'dry-run');
		// Renames are not auto-applied (target inference is deferred to the
		// migration slices f00037 S4–S6). With outstanding violations a
		// non-dry-run apply fails so it never silently no-ops.
		if (count > 0 && !dryRun) {
			return {
				code: EXIT_CODE.VALIDATION,
				error: `${count} unresolved convention violation(s); auto-rename is not implemented. Run with --dry-run to see the backlog, or migrate the files manually.`,
			};
		}
		return data({
			profile: 'typescript',
			dryRun,
			outstanding: count,
			applied: 0,
			toMigrate: report.unmatched ?? [],
		});
	},
};

export const conventionsCommands: readonly ICliCommand[] = [
	checkCommand,
	planCommand,
	applyCommand,
];
