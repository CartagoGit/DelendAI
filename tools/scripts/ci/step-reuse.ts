/**
 * step-reuse.ts — a proof step that passed is not run again on the same inputs.
 *
 * A step that declares its inputs (`step-inputs.constant.ts`) is keyed by
 * the hash of its label, its command, the changed files it was told to judge
 * and the index entries of its inputs at HEAD. The key is only formed when
 * those inputs are clean in the working tree, so the entries are the bytes
 * the step reads. A pass is recorded in a machine-level store, a failure
 * never; a step with no declared inputs has no key and always runs.
 *
 * Reuse needs a store: where git cannot name one, nothing is read or
 * recorded, and a fresh checkout (the forge's) holds no record. `--no-reuse`
 * or `DELENDAI_PROVE_NO_REUSE=1` forces every step to run.
 */
import { createHash } from 'node:crypto';

import { STEP_INPUTS } from './step-inputs.constant';

/** One passed step: the key it passed under and where it passed. */
export interface IStepPass {
	readonly key: string;
	readonly label: string;
	readonly commit: string;
	readonly at: string;
}

/** What reuse asks of its surroundings, so a spec supplies them in memory. */
export interface IStepReuseDeps {
	/** Runs git in the checkout and returns its output; throws on failure. */
	readonly git: (args: readonly string[]) => string;
	/** The store's text, or `undefined` when none can be read or named. */
	readonly read: () => string | undefined;
	/** Keeps the store's text; `false` when no store can be named. */
	readonly write: (text: string) => boolean;
	readonly now: () => Date;
}

/** Passes kept; older ones carry no weight past the latest of a label. */
export const MAX_STEP_PASSES = 300;

const SHORT = 9;

const isStepPass = (value: unknown): value is IStepPass => {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.key === 'string' &&
		typeof entry.label === 'string' &&
		typeof entry.commit === 'string' &&
		typeof entry.at === 'string'
	);
};

/** The passes in a store's text; an unreadable store holds none. */
export const parseStepPasses = (text: string): readonly IStepPass[] => {
	try {
		const parsed: unknown = JSON.parse(text);
		return Array.isArray(parsed) ? parsed.filter(isStepPass) : [];
	} catch {
		return [];
	}
};

/** The key a step passes or is skipped under. */
export const stepKey = (parts: {
	readonly label: string;
	readonly command: string;
	readonly changed: readonly string[];
	readonly entries: string;
}): string =>
	createHash('sha256')
		.update(
			JSON.stringify([
				parts.label,
				parts.command,
				parts.changed,
				parts.entries,
			]),
		)
		.digest('hex');

/** Whether the proof was told not to reuse. */
export const reuseForbidden = (
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): boolean =>
	argv.includes('--no-reuse') || env.DELENDAI_PROVE_NO_REUSE === '1';

/** The line printed in place of a step that is skipped. */
export const reusedLine = (pass: IStepPass): string =>
	`reused: ${pass.label} (inputs unchanged since ${pass.commit.slice(0, SHORT)})`;

/** The reuse of one proof: ask before a step runs, record after it passes. */
export interface IStepReuse {
	/** The earlier pass this step can stand on, when its inputs are unchanged. */
	attempt(
		label: string,
		command: string,
		changed: readonly string[],
	): IStepPass | undefined;
	/** Keep a pass of a step `attempt` was asked about. */
	record(label: string, command: string, changed: readonly string[]): void;
}

/** Reuse over `deps`; `forbidden` makes every step run and none recorded. */
export const createStepReuse = (
	deps: IStepReuseDeps,
	forbidden: boolean,
	inputsOf: Readonly<Record<string, readonly string[]>> = STEP_INPUTS,
): IStepReuse => {
	const keyOf = (
		label: string,
		command: string,
		changed: readonly string[],
	): string | undefined => {
		const inputs = inputsOf[label];
		if (forbidden || inputs === undefined) return undefined;
		try {
			const dirty = deps.git([
				'status',
				'--porcelain',
				'--untracked-files=all',
				'--',
				...inputs,
			]);
			if (dirty !== '') return undefined;
			const entries = deps.git(['ls-files', '-s', '--', ...inputs]);
			return stepKey({ label, command, changed, entries });
		} catch {
			return undefined;
		}
	};
	const passes = (): readonly IStepPass[] => {
		const text = deps.read();
		return text === undefined ? [] : parseStepPasses(text);
	};
	return {
		attempt: (label, command, changed) => {
			const key = keyOf(label, command, changed);
			return key === undefined
				? undefined
				: passes().find((pass) => pass.key === key);
		},
		record: (label, command, changed) => {
			const key = keyOf(label, command, changed);
			if (key === undefined) return;
			const pass: IStepPass = {
				key,
				label,
				commit: deps.git(['rev-parse', 'HEAD']),
				at: deps.now().toISOString(),
			};
			const kept = [
				pass,
				...passes().filter((each) => each.key !== key),
			].slice(0, MAX_STEP_PASSES);
			deps.write(`${JSON.stringify(kept, undefined, '\t')}\n`);
		},
	};
};
