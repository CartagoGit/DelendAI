import { readWorkspacePolicy } from '@delendai/core/cli';

import type { IDoctorCommandCheck } from '../doctor';
import {
	BRANCH_PROTECTION_FILE,
	assessBranchProtection,
	type IBranchProtectionPolicy,
} from '../../lib/doctor/checks/branch-protection.check';

type IPolicyReader = (
	workspace: string,
) => Promise<IBranchProtectionPolicy | undefined>;

export const createBranchProtectionCheck =
	(readPolicy: IPolicyReader): IDoctorCommandCheck =>
	async ({ fs, workspace }) => {
		let policy: IBranchProtectionPolicy | undefined;
		try {
			policy = await readPolicy(workspace);
		} catch (error) {
			return {
				name: 'branch-protection',
				status: 'warn',
				findings: [
					`the development policy could not be read: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		}
		return assessBranchProtection({
			policy,
			projection: await fs.readFile(BRANCH_PROTECTION_FILE),
		});
	};

export const checkBranchProtection: IDoctorCommandCheck =
	createBranchProtectionCheck(readWorkspacePolicy);
