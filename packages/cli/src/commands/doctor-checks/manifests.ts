import { checkManifests as runManifestsCheck } from '../../lib/doctor/checks/manifests.check';
import type { IDoctorCommandCheck } from '../doctor';

export const checkManifests: IDoctorCommandCheck = async (ctx) =>
	runManifestsCheck(ctx);
