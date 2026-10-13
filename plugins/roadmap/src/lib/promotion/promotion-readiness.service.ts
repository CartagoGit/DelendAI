import { GREEN_CHECK_CONCLUSIONS } from '../contracts/constants/gate.constant';
import type {
	IPromotionEvidence,
	IPromotionReadiness,
} from '../contracts/interfaces/promotion-readiness.interface';

/**
 * Whether a promotion may be opened, from the evidence at hand: the
 * checks the integration branch requires are green on its head, code
 * scanning reports nothing open on it, and the roadmap's blocking gates
 * for the next version pass. It decides nothing else — it opens no pull
 * request, and the release branch's own gate still judges the one that
 * is opened.
 */
export const promotionReadiness = (
	evidence: IPromotionEvidence,
): IPromotionReadiness => {
	const heldBackBy: string[] = [];
	const found: string[] = [];
	for (const check of evidence.checks) {
		if (check.conclusion === undefined) {
			heldBackBy.push(
				`${check.name} has not reported on the head of the integration branch`,
			);
		} else if (!GREEN_CHECK_CONCLUSIONS.includes(check.conclusion)) {
			heldBackBy.push(`${check.name} concluded ${check.conclusion}`);
		} else {
			found.push(`${check.name} concluded ${check.conclusion}`);
		}
	}
	if (evidence.openAlerts === undefined) {
		heldBackBy.push(
			'the forge could not be asked for the code scanning alerts',
		);
	} else if (evidence.openAlerts === null) {
		found.push('the project has no code scanning, so it reports no alert');
	} else if (evidence.openAlerts > 0) {
		heldBackBy.push(
			`${String(evidence.openAlerts)} code scanning alert(s) are open on the integration branch`,
		);
	} else {
		found.push('code scanning reports no open alert');
	}
	const { roadmap } = evidence;
	if (roadmap === undefined) {
		found.push('the roadmap holds no version waiting to be published');
	} else if (roadmap.status === 'ready') {
		found.push(`roadmap ${roadmap.version}: ${roadmap.reason}`);
	} else {
		heldBackBy.push(`roadmap ${roadmap.version}: ${roadmap.reason}`);
	}
	return {
		ready: heldBackBy.length === 0,
		version: roadmap?.version,
		heldBackBy,
		evidence: found,
	};
};
