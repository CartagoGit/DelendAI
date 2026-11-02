/**
 * doctor/applicability.ts — which doctor checks describe this workspace.
 *
 * Several checks inspect the shape of the delendai source checkout
 * (authored plugins under `plugins/`, schema inventories, the token
 * budget snapshot). Run in a consumer project they find none of it and
 * used to warn, so a healthy consumer never read clean. Those checks ask
 * `isDelendaiSourceWorkspace` and answer `notApplicable` when it is no.
 *
 * The signal is the same one core's bootstrap uses to recognise this
 * repository: the root package is `@delendai/core-monorepo`.
 */
import type { DoctorCheck, IDoctorFs, IDoctorSection } from './types';

const DELENDAI_SOURCE_PACKAGE_NAME = '@delendai/core-monorepo';

export const parsePackageJson = (
	raw: string | undefined,
): Record<string, unknown> | undefined => {
	if (raw === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

export const isDelendaiSourceWorkspace = async (
	fs: IDoctorFs,
): Promise<boolean> =>
	parsePackageJson(await fs.readFile('package.json'))?.name ===
	DELENDAI_SOURCE_PACKAGE_NAME;

export const notApplicable = (
	name: string,
	reason: string,
): IDoctorSection => ({
	name,
	status: 'not-applicable',
	findings: [reason],
});

/**
 * Wrap a check that only describes the delendai source checkout: it runs
 * there, and reports `not-applicable` everywhere else.
 */
export const sourceCheckoutOnly =
	(name: string, what: string, check: DoctorCheck): DoctorCheck =>
	async (ctx) =>
		(await isDelendaiSourceWorkspace(ctx.fs))
			? check(ctx)
			: notApplicable(
					name,
					`not applicable: ${what} only exists in the delendai source checkout`,
				);
