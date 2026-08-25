import z from 'zod';

const TARGET_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Options contract for `@mcp-vertex/error-reporting`. Everything is
 * optional: the plugin ships sane defaults so an adopter gets
 * automatic error reporting without writing a single config line.
 */
export const OptionsSchema = z.object({
	/**
	 * Master switch. Default `true` — error reporting is intrinsic and
	 * opt-out, not opt-in. Set `false` to disable entirely.
	 */
	enabled: z.boolean().optional(),
	/**
	 * Fixed `owner/name` destination. Only explicit plugin configuration
	 * may override the default; runtime/project data is never consulted.
	 */
	targetRepo: z.string().optional(),
	/** Labels applied to every auto-created issue. */
	labels: z.array(z.string()).optional(),
	/** De-duplication window in hours. Defaults to one day. */
	dedupeWindowHours: z.number().int().positive().optional(),
	/** Max new issues a single installation may create per UTC day. */
	maxIssuesPerDay: z.number().int().positive().optional(),
	/** Consecutive failed dispatches before opening the circuit breaker. */
	circuitBreakerThreshold: z.number().int().positive().optional(),
	/** Base delay for exponential backoff after a failed dispatch. */
	backoffBaseMs: z.number().int().positive().optional(),
	/** Upper bound for exponential backoff delays. */
	backoffMaxMs: z.number().int().positive().optional(),
	/** Jitter ratio applied on top of computed backoff delays. */
	backoffJitterRatio: z.number().min(0).max(1).optional(),
});

export const DEFAULT_TARGET_REPO = 'CartagoGit/mcp-vertex';

export const DEFAULT_LABELS: readonly string[] = ['auto-reported', 'bug'];

export const DEFAULT_DEDUPE_WINDOW_HOURS = 24;

export const DEFAULT_MAX_ISSUES_PER_DAY = 10;

export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

export const DEFAULT_BACKOFF_BASE_MS = 60_000;

export const DEFAULT_BACKOFF_MAX_MS = 3_600_000;

export const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
