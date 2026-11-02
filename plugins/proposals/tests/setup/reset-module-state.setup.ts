/**
 * reset-module-state.setup.ts — clears the process-local state that the
 * proposals modules keep between calls, before each spec file.
 *
 * The project runs with `isolate: false`, so every file in a worker shares
 * one module graph. Each reset below is the owning module's own, so no spec
 * reaches into another module's internals.
 */
import { beforeAll } from 'vitest';

import { resetProposalIndexReadStats } from '../../src/lib/proposals/index-read-stats';
import { resetProposalIndexFallbackNotice } from '../../src/lib/proposals/index-reader-notice';
import { resetStaleProjectionChecks } from '../../src/lib/proposals/index-reader-stale';
import { resetPeerReviewBypassLog } from '../../src/lib/shared/peer-review-bypass-log';
import { resetPlanClosureBypassLog } from '../../src/lib/shared/plan-closure-bypass-log';

beforeAll(() => {
	resetProposalIndexFallbackNotice();
	resetProposalIndexReadStats();
	resetStaleProjectionChecks();
	resetPlanClosureBypassLog();
	resetPeerReviewBypassLog();
});
