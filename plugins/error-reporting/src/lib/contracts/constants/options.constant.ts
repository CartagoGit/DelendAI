import z from 'zod';
import { REPOSITORY_SLUG } from '@mcp-vertex/core/public';

/**
 * Options contract for `@mcp-vertex/error-reporting`. Everything is
 * optional: the plugin ships safe defaults, and automatic reporting is
 * on unless an adopter turns it off.
 */
export const OptionsSchema = z.object({
	/**
	 * Master switch. Default `true` — mcp-vertex reports its OWN
	 * internal failures so they can be fixed. Set `false` to disable
	 * dispatch entirely; the server announces both the default and this
	 * line on every start.
	 */
	enabled: z.boolean().optional(),
	/**
	 * Deprecated compatibility field. The effective destination is always
	 * the MCP Vertex repository and this value is ignored.
	 */
	targetRepo: z.string().optional(),
	/** Deprecated compatibility field. Labels are fixed by MCP Vertex. */
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

/**
 * Where automatic bug reports go.
 *
 * Read from the one declared repository identity rather than spelled out
 * here: this is OUR repository, and a private copy of the slug is a copy
 * that survives a rename by pointing at a redirect.
 */
export const DEFAULT_TARGET_REPO = REPOSITORY_SLUG;

export const DEFAULT_LABELS: readonly string[] = ['auto-reported', 'bug'];

export const DEFAULT_DEDUPE_WINDOW_HOURS = 24;

export const DEFAULT_MAX_ISSUES_PER_DAY = 10;

export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

export const DEFAULT_BACKOFF_BASE_MS = 60_000;

export const DEFAULT_BACKOFF_MAX_MS = 3_600_000;

export const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
