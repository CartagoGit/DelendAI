import { checkConfig as runConfigCheck } from '../../lib/doctor/checks/config.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkConfig: IDoctorCommandCheck = async (ctx) =>
	runConfigCheck(ctx);
