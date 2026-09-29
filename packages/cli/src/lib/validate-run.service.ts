/**
 * validate-run.service.ts — `delendai validate` runs the gates the
 * project declares and journals the outcome the closing tools read.
 *
 * It ran `bun run validate` whatever the project was. Outside this
 * repository that script does not exist, so nothing was ever journalled
 * and no reviewer in such a project could close a proposal: the close
 * answered "no validate run has been journalled" to every one (x00712).
 * The gates are the project's declaration, `validationMatrix.scopes` in
 * `delendai.config.json`, or its own `validate` script run by its own
 * package manager; with neither, it says what to declare.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseJsonc } from '@delendai/core/public';
import {
	appendValidateJournalEntry,
	buildValidateJournalEntry,
	VALIDATE_LOG_RELATIVE_PATH,
} from '@delendai/proposals/public';

import type { IValidateStep } from '../contracts/interfaces/validate-run.interface';

const readJson = (path: string): Record<string, unknown> | undefined => {
	if (!existsSync(path)) return undefined;
	try {
		const { value } = parseJsonc(readFileSync(path, 'utf8'));
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

/** The package manager the project's lockfile names; npm when none does. */
export const packageManagerOf = (workspace: string): string =>
	[
		['bun.lock', 'bun'],
		['bun.lockb', 'bun'],
		['pnpm-lock.yaml', 'pnpm'],
		['yarn.lock', 'yarn'],
	].find(([lock]) => existsSync(join(workspace, lock ?? '')))?.[1] ?? 'npm';

/**
 * The steps the project declares, in order: every command of every
 * `validationMatrix` scope, else its `validate` package script. Empty
 * when it declares neither.
 */
export const declaredValidateSteps = (
	workspace: string,
): readonly IValidateStep[] => {
	const matrix = readJson(join(workspace, 'delendai.config.json'))
		?.validationMatrix as
		| { readonly scopes?: Record<string, readonly { command?: unknown }[]> }
		| undefined;
	const fromMatrix = Object.entries(matrix?.scopes ?? {}).flatMap(
		([scope, gates]) =>
			gates.flatMap((gate) =>
				typeof gate.command === 'string' && gate.command.trim() !== ''
					? [{ scope, command: gate.command }]
					: [],
			),
	);
	if (fromMatrix.length > 0) return fromMatrix;
	const scripts = readJson(join(workspace, 'package.json'))?.scripts as
		| Record<string, unknown>
		| undefined;
	return typeof scripts?.validate === 'string'
		? [
				{
					scope: 'package',
					command: `${packageManagerOf(workspace)} run validate`,
				},
			]
		: [];
};

/** Run the declared steps, each to the end, and journal the outcome. */
export const runValidate = async (
	workspace: string,
	run: (command: string, cwd: string) => number = (command, cwd) =>
		spawnSync(command, { cwd, shell: true, stdio: 'inherit' }).status ?? 1,
): Promise<
	| { readonly declared: false }
	| {
			readonly declared: true;
			readonly passed: boolean;
			readonly failed: readonly string[];
			readonly journal: string;
	  }
> => {
	const steps = declaredValidateSteps(workspace);
	if (steps.length === 0) return { declared: false };
	// Every step runs: one blocker found per pass cost a pass per blocker.
	const failed = steps
		.filter((step) => run(step.command, workspace) !== 0)
		.map((step) => `${step.scope}: ${step.command}`);
	const journal = await appendValidateJournalEntry({
		workspaceRoot: workspace,
		entry: buildValidateJournalEntry({
			exitCode: failed.length === 0 ? 0 : 1,
			timestamp: new Date().toISOString(),
			logPath: join(workspace, VALIDATE_LOG_RELATIVE_PATH),
			command: steps.map((step) => step.command).join(' && '),
			failedSteps: failed,
		}),
	});
	return { declared: true, passed: failed.length === 0, failed, journal };
};
