import {
	checkGitStatus as createLibGitStatusCheck,
	defaultGitProbe,
	type IGitStatusProbe,
} from '../../lib/doctor/checks/git-status.check';
import type { IDoctorCommandCheck } from '../doctor';

export const createGitStatusCheck = (
	probe: IGitStatusProbe = defaultGitProbe,
): IDoctorCommandCheck => {
	const check = createLibGitStatusCheck(probe);
	return async (ctx) => check(ctx);
};

export const checkGitStatus = createGitStatusCheck();

export type { IGitStatusProbe };
