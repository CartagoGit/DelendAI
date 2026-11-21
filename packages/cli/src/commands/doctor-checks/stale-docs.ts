import {
	checkStaleDocs as createLibStaleDocsCheck,
	defaultStaleDocsProbe,
	type IStaleDocsProbe,
} from '../../lib/doctor/checks/stale-docs.check';
import type { IDoctorCommandCheck } from '../doctor';

export const createStaleDocsCheck = (
	probe: IStaleDocsProbe = defaultStaleDocsProbe,
): IDoctorCommandCheck => {
	const check = createLibStaleDocsCheck(probe);
	return async (ctx) => check(ctx);
};

export const checkStaleDocs = createStaleDocsCheck();

export type { IStaleDocsProbe };
