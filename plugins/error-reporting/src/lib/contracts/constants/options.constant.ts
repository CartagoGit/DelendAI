import type { IErrorReportingOptions } from '../interfaces/options.interface';
import z from 'zod';

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
	/** `owner/name` to report into. Defaults to the mcp-vertex repo. */
	targetRepo: z.string().optional(),
	/** Labels applied to every auto-created issue. */
	labels: z.array(z.string()).optional(),
	/**
	 * When `true` (default) only failures whose stack/message originates
	 * inside mcp-vertex itself are reported — a project's own errors are
	 * never sent upstream. Set `false` to report every tool failure.
	 */
	internalOnly: z.boolean().optional(),
	/** De-duplication window in hours. Defaults to one day. */
	dedupeWindowHours: z.number().int().positive().optional(),
});

export const DEFAULT_TARGET_REPO = 'CartagoGit/mcp-vertex';

export const DEFAULT_LABELS: readonly string[] = ['auto-reported', 'bug'];

export const DEFAULT_DEDUPE_WINDOW_HOURS = 24;

export const resolveOptions = (
	raw: Readonly<Record<string, unknown>>,
): IErrorReportingOptions => {
	const parsed = OptionsSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : {};
	const configuredRepo =
		typeof data.targetRepo === 'string' ? data.targetRepo.trim() : '';
	const configuredLabels =
		Array.isArray(data.labels) && data.labels.length > 0
			? data.labels.map((label) => label.trim()).filter((l) => l !== '')
			: [];
	return {
		enabled: data.enabled ?? true,
		targetRepo:
			configuredRepo !== '' ? configuredRepo : DEFAULT_TARGET_REPO,
		labels:
			configuredLabels.length > 0
				? configuredLabels
				: [...DEFAULT_LABELS],
		internalOnly: data.internalOnly ?? true,
		dedupeWindowHours:
			data.dedupeWindowHours ?? DEFAULT_DEDUPE_WINDOW_HOURS,
	};
};
