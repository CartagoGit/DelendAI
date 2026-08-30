import { checkPermissions as runPermissionsCheck } from '../../lib/doctor/checks/permissions.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkPermissions: IDoctorCommandCheck = async (ctx) =>
	runPermissionsCheck(ctx);
