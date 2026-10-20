import type { IToolIdentityRegistry } from '@delendai/core/public';
import {
	asReportableError,
	buildSafeReport,
	extractObservedFailure,
} from '../../../../../../../plugins/error-reporting/src/lib/report-builder.helper';
import { validateSafeReport } from '../../../../../../../plugins/error-reporting/src/lib/privacy-validator.helper';

const registry: IToolIdentityRegistry = {
	get: () => undefined,
	list: () => new Map(),
};

const result = {
	structuredContent: {
		error: 'project-owned failure',
		stack: [
			'Error: project-owned failure',
			'    at run (/workspace/acme-billing/node_modules/@delendai/acme-billing-private/src/charge.ts:12:3)',
		].join('\n'),
	},
};
const observed = extractObservedFailure(result, undefined);

const reportable = asReportableError('acme_billing_tool', registry, observed);
const report =
	reportable === undefined
		? undefined
		: buildSafeReport({
				toolName: 'acme_billing_tool',
				toolRegistry: registry,
				error: reportable,
			});

console.log(
	JSON.stringify({
		classifiedAsInternal: reportable !== undefined,
		packageId: report?.packageId,
		frames: report?.mcpFrames,
		privacyValidation:
			report === undefined ? undefined : validateSafeReport(report),
	}),
);
