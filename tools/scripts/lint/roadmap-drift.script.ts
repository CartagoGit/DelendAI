#!/usr/bin/env bun
/**
 * roadmap-drift — what is derived from the roadmap file still says what
 * the file says.
 *
 * The roadmap file is the authority. The JSON a page reads and the
 * timeline are projections of it; when either lags, the page shows a
 * roadmap nobody wrote and the timeline tells a story that stops short.
 * The remedy is always to regenerate, never to edit the projection:
 *
 *   bun tools/scripts/gen/roadmap-projection.script.ts
 */
import { repoRoot } from '../lib/repo-root';
import { roadmapDrift } from '../gen/roadmap-projection.lib';

const main = async (): Promise<number> => {
	const findings = await roadmapDrift(repoRoot());
	if (findings.length === 0) {
		console.log(
			'✓ roadmap-drift: the projection and the timeline match the roadmap file.',
		);
		return 0;
	}
	console.error(
		`✖ roadmap-drift: ${String(findings.length)} projection(s) out of date:\n${findings
			.map((finding) => `  ${finding}`)
			.join(
				'\n',
			)}\n\n  The roadmap file is the authority. Regenerate, do not edit:\n  bun tools/scripts/gen/roadmap-projection.script.ts`,
	);
	return 1;
};

if (import.meta.main) process.exit(await main());
