import { checkTokenBudgets as runTokenBudgetsCheck } from '../../lib/doctor/checks/token-budgets.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkTokenBudgets: IDoctorCommandCheck = async (ctx) =>
	runTokenBudgetsCheck(ctx);
