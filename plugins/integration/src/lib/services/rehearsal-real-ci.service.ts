/**
 * rehearsal-real-ci.service.ts — real mode: the project's own CI and scan
 * workflows run on the rehearsal branch, and the wall time of a pull
 * request's CI is judged against the same target in the rehearsal report
 * and in production (`ci:cost`).
 *
 * The workflows are the project's files with only their branch filters
 * rendered for the rehearsal branch, so the rehearsal runs the trigger
 * graph production runs.
 */
import { PR_CI_WALL_TARGET_MINUTES } from '../contracts/constants/rehearsal.constant';
import type {
	IPrCiWallVerdict,
	IRehearsalFileChange,
} from '../contracts/interfaces/rehearsal.interface';

const WORKFLOWS = '.github/workflows';
const SECONDS_PER_MINUTE = 60;

/** Judge a wall time (seconds) the one way the report and production do. */
export const judgePrCiWall = (
	wallSeconds: number,
	touchesIntegrationCode: boolean,
): IPrCiWallVerdict => {
	const thresholdMinutes = touchesIntegrationCode
		? PR_CI_WALL_TARGET_MINUTES.withRehearsal
		: PR_CI_WALL_TARGET_MINUTES.plain;
	const minutes = wallSeconds / SECONDS_PER_MINUTE;
	return { ok: minutes < thresholdMinutes, minutes, thresholdMinutes };
};

/** One job's seconds between two instants, or `undefined` when a step has no times. */
export const wallSecondsOf = (
	steps: readonly {
		readonly startMs: number;
		readonly endMs: number;
	}[],
): number =>
	steps.length === 0
		? 0
		: Math.round(
				(Math.max(...steps.map((s) => s.endMs)) -
					Math.min(...steps.map((s) => s.startMs))) /
					1000,
			);

const BRANCHES_INLINE = /^(\s*)branches:\s*\[.*\]\s*$/u;
const BRANCHES_BLOCK = /^(\s*)branches:\s*$/u;
const TOP_KEY = /^\S/u;

/**
 * `text` with every `branches` filter under `on:` set to `[branch]`. Only
 * the trigger block changes; steps, jobs and the pinned actions stay as the
 * project wrote them.
 */
export const renderBranchFilters = (text: string, branch: string): string => {
	const out: string[] = [];
	let inOn = false;
	let skipItemsOf: number | undefined;
	for (const line of text.split('\n')) {
		if (TOP_KEY.test(line)) inOn = /^(on|"on"|'on'):/u.test(line);
		if (skipItemsOf !== undefined) {
			const item = /^(\s*)-\s/u.exec(line);
			if (item !== null && (item[1]?.length ?? 0) >= skipItemsOf)
				continue;
			skipItemsOf = undefined;
		}
		const inline = inOn ? BRANCHES_INLINE.exec(line) : null;
		const block = inOn ? BRANCHES_BLOCK.exec(line) : null;
		if (inline !== null) {
			out.push(`${inline[1] ?? ''}branches: ['${branch}']`);
		} else if (block !== null) {
			out.push(`${block[1] ?? ''}branches: ['${branch}']`);
			skipItemsOf = block[1]?.length ?? 0;
		} else out.push(line);
	}
	return out.join('\n');
};

/** The files a real-mode setup commit writes: the project's CI and scan workflows for the rehearsal branch. */
export const realModeFiles = (input: {
	readonly integration: string;
	/** Workflow file name → its text, as the project has them. */
	readonly workflows: Readonly<Record<string, string>>;
}): readonly IRehearsalFileChange[] =>
	Object.entries(input.workflows).map(([name, text]) => ({
		path: `${WORKFLOWS}/${name}`,
		content: renderBranchFilters(text, input.integration),
	}));
