import { announceLines } from '@mcp-vertex/core/public';

/**
 * What the operator is told about automatic error reporting the moment
 * the server comes up.
 *
 * Reporting that is on by default is only legitimate if the person it
 * runs for is told, in the same breath, exactly what leaves the machine
 * and how to turn it off. Burying that in documentation would make the
 * default a trick. So the notice is emitted on every start — one short
 * block, on stderr, next to the other boot diagnostics — and it always
 * carries the literal config line to flip.
 *
 * The disabled branch exists for the opposite reason: a silent opt-out
 * means nobody ever reconsiders. It asks once, per start, and says what
 * the operator gets in return.
 */
export interface IErrorReportingStartupNotice {
	readonly lines: readonly string[];
}

/** The exact key an operator edits in `mcp-vertex.config.json`. */
export const ERROR_REPORTING_ENABLE_CONFIG =
	'plugins.error-reporting.options.enabled' as const;

/**
 * One sentence on the privacy contract, in the notice itself rather
 * than behind a link. It is the claim the operator is being asked to
 * accept, so it has to be legible where the decision is made — and it
 * is enforced by `privacy-validator.helper.ts`, not merely promised
 * here: a report carries a bug signature, the failing `@mcp-vertex/*`
 * frames and version data, and a DTO that names any absolute path,
 * URL, email, branch, token or code fragment is refused before dispatch.
 */
export const ERROR_REPORTING_PRIVACY_SENTENCE =
	'Only mcp-vertex-internal errors are sent (error type, mcp-vertex stack frames, versions) — never your code, file contents, paths, branch names, environment or project data.';

export const buildErrorReportingStartupNotice = (input: {
	readonly enabled: boolean;
	readonly targetRepo: string;
}): IErrorReportingStartupNotice => {
	if (input.enabled) {
		return {
			lines: [
				`[mcp-vertex] error-reporting is ON: mcp-vertex bugs are reported automatically as de-duplicated issues on ${input.targetRepo}.`,
				`[mcp-vertex] ${ERROR_REPORTING_PRIVACY_SENTENCE}`,
				`[mcp-vertex] To turn it off, set \`${ERROR_REPORTING_ENABLE_CONFIG} = false\` in mcp-vertex.config.json.`,
			],
		};
	}
	return {
		lines: [
			'[mcp-vertex] error-reporting is OFF: mcp-vertex bugs hit here are never reported, so they cannot be fixed for you or anyone else.',
			`[mcp-vertex] Please consider setting \`${ERROR_REPORTING_ENABLE_CONFIG} = true\` in mcp-vertex.config.json. ${ERROR_REPORTING_PRIVACY_SENTENCE}`,
		],
	};
};

/**
 * Write the notice. Never throws: a boot message must not be able to
 * stop the server it is describing.
 */
export const announceErrorReportingStartup = (
	notice: IErrorReportingStartupNotice,
	write?: (line: string) => void,
): void => {
	announceLines(notice.lines, write);
};
