import {
	summarizeFindings,
	type FindingSeverity,
	type IFinding,
	worstSeverity,
} from '@delendai/core/public';

import type {
	IReadonlyReleaseHealthRecord,
	IReleaseHealth,
	IReleaseHealthSummary,
} from './interfaces';

const releaseSeverity = (row: IReleaseHealth): FindingSeverity => {
	if (row.crashFreeRate < 0.99) return 'critical';
	if (row.crashFreeRate < 0.995) return 'high';
	if (row.crashFreeRate < 0.999) return 'medium';
	if (row.crashFreeRate < 0.9995) return 'low';
	return 'info';
};

const toFinding = (row: IReleaseHealth): IFinding => ({
	ruleId: 'obs_release_health',
	severity: releaseSeverity(row),
	message: `${row.version} — ${row.crashCount}/${row.totalSessions} crash session(s), crash-free ${row.crashFreeRate}`,
});

export const computeReleaseHealth = (
	records: readonly IReadonlyReleaseHealthRecord[],
): readonly IReleaseHealth[] => {
	const versions = new Map<string, Map<string, { crashed: boolean }>>();
	for (const record of records) {
		const sessions =
			versions.get(record.version) ??
			new Map<string, { crashed: boolean }>();
		const existing = sessions.get(record.sessionId);
		sessions.set(record.sessionId, {
			crashed: existing?.crashed === true || record.crashed,
		});
		versions.set(record.version, sessions);
	}
	return [...versions.entries()]
		.map(([version, sessions]) => {
			const totalSessions = sessions.size;
			let crashCount = 0;
			for (const session of sessions.values()) {
				if (session.crashed) crashCount += 1;
			}
			const crashFreeRate =
				totalSessions === 0
					? 1
					: (totalSessions - crashCount) / totalSessions;
			return {
				version,
				totalSessions,
				crashCount,
				crashFreeRate,
			};
		})
		.sort((left, right) => {
			if (right.totalSessions !== left.totalSessions) {
				return right.totalSessions - left.totalSessions;
			}
			return right.version.localeCompare(left.version);
		});
};

export const summarizeReleaseHealth = (
	rows: readonly IReleaseHealth[],
): IReleaseHealthSummary => {
	const findings = rows.map(toFinding);
	return {
		summary: summarizeFindings(findings),
		worst: worstSeverity(findings) ?? null,
	};
};

export const severityForReleaseHealth = releaseSeverity;
