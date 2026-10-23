#!/usr/bin/env bun
/**
 * A thin wrapper. The invariants themselves ship with the product now —
 * see `packages/cli/src/lib/workflow-invariants.service.ts` — because
 * every project that follows the work-ref model needs to be able to ask
 * whether the model is holding, not only a clone of delendai itself.
 *
 * This file remains so `bun run work:doctor` keeps working, and so the
 * checks reach CI through a script rather than through the CLI binary.
 */
import { renderInvariantReport, runWorkflowDoctor } from '@delendai/cli';

const report = await runWorkflowDoctor({
	from: process.cwd(),
	...(process.argv.includes('--forge') ? { scopes: ['forge' as const] } : {}),
});
if (report === undefined) {
	console.error('work doctor: not inside a git working tree.');
	process.exit(1);
}
console.log(renderInvariantReport(report));
// `--except=<id,id>`: invariants reported and not counted. The queue asks
// about the forge right after it started bringing candidates forward, so
// a candidate still behind is its own work in progress, not a hang.
const excepted = new Set(
	(
		process.argv
			.find((arg) => arg.startsWith('--except='))
			?.slice('--except='.length) ?? ''
	)
		.split(',')
		.filter((id) => id.length > 0),
);
const counted = report.results.filter(
	(result) => !result.holds && !excepted.has(result.id),
);
if (excepted.size > 0) {
	console.log(
		`workflow-invariants: ${String(counted.length)} counted (not counting ${[...excepted].join(', ')}).`,
	);
}
process.exit(counted.length === 0 ? 0 : 1);
