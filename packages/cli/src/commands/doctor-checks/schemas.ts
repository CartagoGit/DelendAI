import { checkSchemas as runSchemasCheck } from '../../lib/doctor/checks/schemas.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkSchemas: IDoctorCommandCheck = async (ctx) =>
	runSchemasCheck(ctx);
