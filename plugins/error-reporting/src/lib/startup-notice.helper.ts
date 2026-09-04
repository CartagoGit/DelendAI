import { announceLines } from '@delendai/core/public';

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
import type { IErrorReportingStartupNotice } from './contracts/interfaces/startup-notice.interface';
import {
	ERROR_REPORTING_ENABLE_CONFIG,
	ERROR_REPORTING_PRIVACY_SENTENCE,
} from './contracts/constants/startup-notice.constant';

export type { IErrorReportingStartupNotice };
export { ERROR_REPORTING_ENABLE_CONFIG, ERROR_REPORTING_PRIVACY_SENTENCE };

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
