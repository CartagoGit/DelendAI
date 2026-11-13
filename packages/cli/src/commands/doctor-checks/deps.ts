import { checkDeps as runDepsCheck } from '../../lib/doctor/checks/deps.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkDeps: IDoctorCommandCheck = async (ctx) => runDepsCheck(ctx);
