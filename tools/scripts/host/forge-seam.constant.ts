/** Constants for `./forge-seam.service`. */

import type { IForgeCheckRun } from '@delendai/core/cli';

/** The forge CLI binary. The user's own session authenticates it. */
export const FORGE_CLI = 'gh';

/** How long one forge request may take before the boot moves on. */
export const FORGE_REQUEST_TIMEOUT_MS = 20_000;

/** Largest response the boot buffers (a page of 100 pull requests). */
export const FORGE_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/** The page size the listing endpoints are asked for. */
export const FORGE_PAGE_SIZE = 100;

export const HTTP_OK = 200;
export const HTTP_NOT_MODIFIED = 304;
/** The forge's answer for a commit it does not have: no runs to read. */
export const HTTP_UNKNOWN_COMMIT = 422;
export const HTTP_SUCCESS_FLOOR = 200;
export const HTTP_SUCCESS_CEILING = 300;

/** Workflow name recorded when the forge names no app for a check. */
export const UNKNOWN_CHECK_WORKFLOW = 'unknown';

type IState = IForgeCheckRun['state'];

/** A finished check run's conclusion, as the mirror's states. */
export const CHECK_STATE_BY_CONCLUSION: Readonly<Record<string, IState>> = {
	success: 'success',
	failure: 'failure',
	cancelled: 'cancelled',
	timed_out: 'timed_out',
	neutral: 'neutral',
	skipped: 'neutral',
	stale: 'cancelled',
	action_required: 'failure',
	startup_failure: 'failure',
};
