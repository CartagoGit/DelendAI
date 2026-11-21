import { checkPorts as runPortsCheck } from '../../lib/doctor/checks/ports.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkPorts: IDoctorCommandCheck = async (ctx) =>
	runPortsCheck(ctx);
