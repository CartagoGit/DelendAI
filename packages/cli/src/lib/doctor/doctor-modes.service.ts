/**
 * doctor-modes — the pure helpers behind `doctor --ci` and `--offline`.
 *
 * Kept out of the command file so it stays small and so the report a
 * pipeline reads is built in one place.
 */
import {
	DOCTOR_CI_EXIT_MEANING,
	DOCTOR_OFFLINE_SKIP_FINDING,
} from '../../contracts/constants/doctor-modes.constant';
import type {
	IDoctorCiReport,
	IDoctorModes,
} from '../../contracts/interfaces/doctor-modes.interface';
import { hasFlag } from '../helpers/cli-command.helper';
import type { DoctorSectionStatus, IDoctorSection } from './types';

export const parseDoctorModes = (args: readonly string[]): IDoctorModes => ({
	ci: hasFlag(args, 'ci'),
	offline: hasFlag(args, 'offline'),
	deep: hasFlag(args, 'deep'),
});

/**
 * The section for a check `--offline` did not run. It is not-applicable,
 * never ok: a skipped check must read as skipped, not as passed.
 */
export const skippedOfflineSection = (name: string): IDoctorSection => ({
	name,
	status: 'not-applicable',
	findings: [DOCTOR_OFFLINE_SKIP_FINDING],
});

export const isSkippedSection = (section: IDoctorSection): boolean =>
	section.status === 'not-applicable' &&
	section.findings.some((finding) => finding.startsWith('skipped:'));

export const buildCiReport = (
	status: DoctorSectionStatus,
	sections: readonly IDoctorSection[],
	exitCode: number,
): IDoctorCiReport => ({
	exitCode,
	meaning: DOCTOR_CI_EXIT_MEANING[status],
	failing: sections
		.filter((s) => s.status === 'warn' || s.status === 'error')
		.map((s) => s.name),
	skipped: sections.filter(isSkippedSection).map((s) => s.name),
});
