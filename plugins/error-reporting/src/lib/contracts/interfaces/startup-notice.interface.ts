/**
 * What the operator is told about automatic error reporting at every
 * start. See `startup-notice.helper.ts`: a default that sends anything
 * anywhere is only legitimate if it is announced where the operator
 * will see it, with the line that turns it off.
 */
export interface IErrorReportingStartupNotice {
	readonly lines: readonly string[];
}
