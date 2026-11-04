#!/usr/bin/env bun
/**
 * drain-telemetry.script.ts — folds the telemetry journals into the stores.
 *
 * Published code appends work events and measured transitions to journal
 * files under the cache; this reads them into the work event bus and the
 * ETA duration history. Safe to run at any time and as often as wanted.
 *
 * Usage: bun tools/scripts/telemetry/drain-telemetry.script.ts [--workspace=<dir>]
 */
import { readGit } from '@delendai/core/runtime';
import { dirname, join, resolve } from 'node:path';

import {
	DurationHistoryFacade,
	WorkEventStoreFacade,
	drainTelemetryJournals,
} from '@delendai/state-telemetry/public';

const workspaceArg = process.argv
	.find((arg) => arg.startsWith('--workspace='))
	?.slice('--workspace='.length);

/** Journals live in the shared checkout, whichever worktree this runs in. */
const sharedRoot = (from: string): string => {
	const common = readGit(from, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	return common === undefined ? from : dirname(common);
};

const main = async (): Promise<void> => {
	const root = sharedRoot(resolve(workspaceArg ?? process.cwd()));
	const events = new WorkEventStoreFacade({ workspaceRoot: root });
	const history = new DurationHistoryFacade({
		path: join(root, '.cache/delendai/telemetry/duration-history.sqlite'),
	});
	try {
		const result = await drainTelemetryJournals({
			root,
			events,
			history,
		});
		process.stdout.write(`${JSON.stringify(result)}\n`);
	} finally {
		events.close();
		history.close();
	}
};

await main();
