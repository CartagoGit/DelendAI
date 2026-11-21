/**
 * reconciler-run.service.ts — start one reconciler pass for an event.
 *
 * A land merge, a pull request closing, `work retire` and `work deliver`
 * each start exactly one pass, through the repository's own script, so
 * the list of what a pass does lives in that script and not here. The
 * pass is launched detached: the event that asked for it never waits on
 * it and never fails because of it, and the periodic upkeep is the safety
 * net for a pass that did not run.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { RECONCILER_SCRIPT } from '../contracts/constants/ref-kinds.constant';
import type {
	IReconcileTrigger,
	IReconcilerRunPorts,
} from '../contracts/interfaces/ref-reconciler.interface';

/** The ports of a real checkout rooted at `root`. */
export const reconcilerRunPortsAt = (root: string): IReconcilerRunPorts => ({
	exists: (script) =>
		access(join(root, script)).then(
			() => true,
			() => false,
		),
	spawn: (script, args) => {
		const child = spawn('bun', [script, ...args], {
			cwd: root,
			detached: true,
			stdio: 'ignore',
		});
		child.on('error', () => undefined);
		child.unref();
	},
});

/** Start one pass for `trigger`; `skipped` when the repository has no reconciler script. */
export const startReconcilerPass = async (
	trigger: IReconcileTrigger,
	root: string,
	ports: IReconcilerRunPorts = reconcilerRunPortsAt(root),
): Promise<'started' | 'skipped'> => {
	if (!(await ports.exists(RECONCILER_SCRIPT))) return 'skipped';
	try {
		ports.spawn(RECONCILER_SCRIPT, ['--apply', `--trigger=${trigger}`]);
		return 'started';
	} catch {
		// Never fatal: the next event, or the upkeep, runs it again.
		return 'skipped';
	}
};
