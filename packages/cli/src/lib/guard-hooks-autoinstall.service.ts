/**
 * Starting a server reads the project. It never writes to it.
 *
 * This module used to install: a project that declared a `development`
 * block had its `.husky/` rewritten on every boot, on the theory that a
 * policy which only advises is a policy an agent can ignore. The theory
 * was right and the remedy was not. Opening a folder in an editor
 * produced eleven modified files in an unrelated repository — five of
 * them the project's own git hooks, staged, carrying the installing
 * machine's absolute paths, ready to be committed to colleagues who
 * installed nothing.
 *
 * Writing to somebody's repository because they opened it is not a
 * default a tool gets to have, and no configuration flag makes it one:
 * from the outside it is indistinguishable from something malicious.
 *
 * So there is no install path here at all. Boot inspects and says what
 * it found. Installing is `delendai guard install` — a command somebody
 * types, or a project's own `prepare`.
 */
import { parseJsonc } from '@delendai/core/public';

import type {
	IGuardAutoinstallOutcome,
	IGuardHooksMode,
} from '../contracts/interfaces/guard-hooks-autoinstall.interface';
import type { IGuardHooksReport } from '../contracts/interfaces/guard-hooks-service.interface';
import { isRecord } from './helpers/cli-command.helper';
import { readConfigText } from './config-file.service';
import { inspectGuardHooks } from './guard-hooks.service';

/** What the project asks for, or `absent` when it declares no policy. */
export const guardHooksMode = async (
	workspaceRoot: string,
): Promise<IGuardHooksMode | 'absent'> => {
	const text = await readConfigText(workspaceRoot);
	if (text === undefined) return 'absent';
	const parsed = parseJsonc(text);
	if (parsed.errors.length > 0) return 'absent';
	const config = parsed.value;
	if (!isRecord(config) || !isRecord(config.development)) return 'absent';
	const declared = config.development.guardHooks;
	if (declared === 'report' || declared === 'off' || declared === 'install') {
		return declared;
	}
	return 'report';
};

const describe = (report: IGuardHooksReport): string[] => [
	`guard hooks ${report.dir}`,
	...report.hooks.map(
		(entry) =>
			`  ${entry.hook}: ${entry.state}${entry.reason === undefined ? '' : ` — ${entry.reason}`}`,
	),
];

/** Nothing to say, and nothing done. */
const SILENT = (
	mode: IGuardHooksMode | 'absent',
): IGuardAutoinstallOutcome => ({
	mode,
	lines: [],
});

/**
 * Look at the guard a workspace declares and report it. Writes nothing,
 * whatever the configuration says, and never throws: a repository that
 * cannot be inspected still gets its server.
 *
 * `development.guardHooks: "install"` is honoured as a statement of
 * intent — the report names the command — not as permission to write
 * during boot. The two are not the same act, and only one of them was
 * asked for by the person who opened the folder.
 */
export const reportGuardHooks = async (input: {
	readonly workspaceRoot: string;
}): Promise<IGuardAutoinstallOutcome> => {
	const mode = await guardHooksMode(input.workspaceRoot);
	if (mode === 'absent' || mode === 'off') return SILENT(mode);
	try {
		const report = inspectGuardHooks(input.workspaceRoot);
		const missing = report.hooks.some(
			(entry) => entry.state !== 'installed',
		);
		return {
			mode,
			report,
			lines: [
				...describe(report),
				...(missing
					? ['  run `delendai guard install` to install them']
					: []),
			],
		};
	} catch (error) {
		return {
			mode,
			lines: [
				`guard hooks could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};
