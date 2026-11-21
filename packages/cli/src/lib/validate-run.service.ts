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

import { packageManagerFrom, validationGateSteps } from '@delendai/core/cli';
import {
	appendValidateJournalEntry,
	buildValidateJournalEntry,
	VALIDATE_LOG_RELATIVE_PATH,
} from '@delendai/proposals/public';

import type { IValidateStep } from '../contracts/interfaces/validate-run.interface';

/** A file of the workspace, or `undefined` when it has none. */
const workspaceReader =
	(workspace: string) =>
	(relativePath: string): string | undefined => {
		const path = join(workspace, relativePath);
		return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
	};

/** The package manager the project's lockfile names; npm when none does. */
export const packageManagerOf = (workspace: string): string =>
	packageManagerFrom(workspaceReader(workspace));

/**
 * The steps the project declares, in order: every command of every
 * `validationMatrix` scope, else its `validate` package script. Empty
 * when it declares neither. The merge model's certification reads the
 * same declaration, so the two gates cannot drift apart.
 */
export const declaredValidateSteps = (
	workspace: string,
): readonly IValidateStep[] => validationGateSteps(workspaceReader(workspace));

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
