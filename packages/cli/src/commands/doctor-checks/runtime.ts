import { checkRuntime as runRuntimeCheck } from '../../lib/doctor/checks/runtime.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkRuntime: IDoctorCommandCheck = async (ctx) =>
	runRuntimeCheck(ctx);
