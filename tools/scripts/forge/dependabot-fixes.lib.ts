/**
 * dependabot-fixes.lib.ts — which Dependabot alerts open on the release
 * branch the integration branch already fixes.
 *
 * The forge reports Dependabot alerts for the release (default) branch,
 * and one closes only when a promotion carries the patched version there.
 * The promotion's body names the alerts it closes; an alert whose patch
 * is not yet on the integration branch is reported so someone fixes it
 * there first. Pure: the lockfile text and the forge's answer come in.
 */

export interface IDependabotAlert {
	readonly number: number;
	readonly package: string;
	/** The first patched version, or none when the advisory has no fix. */
	readonly patched: string | null;
	readonly severity: string;
}

export interface IAlertFixes {
	readonly fixed: readonly IDependabotAlert[];
	readonly unfixed: readonly IDependabotAlert[];
}

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Every version of a package a `bun.lock` resolves, nested copies included. */
export const lockedVersions = (
	lockText: string,
	name: string,
): readonly string[] => {
	const entry = new RegExp(`\\["${escapeRegExp(name)}@([^"]+)"`, 'gu');
	return [...lockText.matchAll(entry)].map((match) => match[1] ?? '');
};

const numbersOf = (version: string): readonly number[] =>
	version
		.split('-')[0]!
		.split('.')
		.map((part) => Number.parseInt(part, 10) || 0);

/** Negative when `a` is older than `b`; prereleases compare by their release. */
export const compareVersions = (a: string, b: string): number => {
	const left = numbersOf(a);
	const right = numbersOf(b);
	for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
		const diff = (left[at] ?? 0) - (right[at] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
};

/**
 * Fixed when no copy of the package in the patched version's major line is
 * older than the patch (a package no longer in the lockfile is fixed too).
 */
const isFixedBy = (alert: IDependabotAlert, lockText: string): boolean => {
	if (alert.patched === null) return false;
	const patched = alert.patched;
	const line = numbersOf(patched)[0];
	return lockedVersions(lockText, alert.package)
		.filter((version) => numbersOf(version)[0] === line)
		.every((version) => compareVersions(version, patched) >= 0);
};

export const classifyAlerts = (
	alerts: readonly IDependabotAlert[],
	integrationLock: string,
): IAlertFixes => ({
	fixed: alerts.filter((alert) => isFixedBy(alert, integrationLock)),
	unfixed: alerts.filter((alert) => !isFixedBy(alert, integrationLock)),
});

/** The forge's `--jq` rows (one JSON object per line) as alerts. */
export const alertsOfForgeOutput = (out: string): readonly IDependabotAlert[] =>
	out
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as IDependabotAlert);

const label = (alert: IDependabotAlert): string =>
	`#${alert.number} ${alert.package} (${alert.severity})`;

/** The promotion body's lines for the alerts it closes; none when it closes none. */
export const fixedAlertLines = (fixes: IAlertFixes): readonly string[] =>
	fixes.fixed.map(
		(alert) =>
			`closes Dependabot alert ${label(alert)}: patched in ${alert.patched}`,
	);

/** The output lines for the alerts no integration-branch version fixes. */
export const unfixedAlertLines = (fixes: IAlertFixes): readonly string[] =>
	fixes.unfixed.map(
		(alert) =>
			`Dependabot alert ${label(alert)} stays open: ${alert.patched === null ? 'its advisory has no patched version' : `the integration branch is below ${alert.patched}`}`,
	);
