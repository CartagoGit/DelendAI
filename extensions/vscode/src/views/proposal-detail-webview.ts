/**
 * proposal-detail-webview.ts — adapter that delegates to the
 * host-agnostic `renderProposalDetailHtml` from
 * `@delendai/ui-extension/webview`, projecting the legacy
 * `IViewCopy` onto the shared `IProposalDetailCopy`.
 *
 * This file preserves the original surface so existing callers
 * (`registerOpenProposalCommand`) keep working unchanged; the only
 * reason it still exists is to keep the `viewCopyFor(lang)` →
 * `IProposalDetailCopy` mapping localised to the extension and to
 * re-export `IProposalDetail` as a legacy alias.
 */
import {
	renderProposalDetailBody as renderSharedProposalDetailBody,
	renderProposalDetailHtml as renderSharedProposalDetailHtml,
	type IProposalDetail,
	type IProposalDetailCopy,
} from '@delendai/ui-extension/webview';

import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { viewCopyFor } from '../i18n/view-copy.strings';

/** Legacy alias — preserves the original import path. */
export type {
	IProposalDetail,
	IProposalDetailCopy,
} from '@delendai/ui-extension/webview';

const projectCopy = (viewCopy: IViewCopy): IProposalDetailCopy => ({
	lang: viewCopy.lang,
	folder: viewCopy.folder,
	slices: viewCopy.slices,
	slice: viewCopy.slice,
	status: viewCopy.status,
	owner: viewCopy.owner,
	claimableNow: viewCopy.claimableNow,
	lockOwners: viewCopy.lockOwners,
	notActionable: viewCopy.notActionable,
	noSlices: viewCopy.noSlices,
	diagnose: viewCopy.diagnose,
	noDiagnosis: viewCopy.noDiagnosis,
	emptyDiagnosis: viewCopy.emptyDiagnosis,
	logs: viewCopy.logs,
	noLogs: viewCopy.noLogs,
	time: viewCopy.time,
	kind: viewCopy.kind,
	agent: viewCopy.agent,
	summary: viewCopy.summary,
	// Plan / Agents / Progress labels stay English-only per f00097
	// S3 (partial translations hide search keywords the user types
	// in the extension UI). We still let a host override them by
	// supplying a custom `copy` arg — the shared renderer respects
	// whatever `IProposalDetailCopy` it receives.
	plan: 'Plan',
	noPlan: 'No plan file is attached to this proposal.',
	agents: 'Agents working',
	noAgents: 'No agents are currently working on this proposal.',
	progress: 'Progress',
	eta: 'Estimated remaining',
	etaShort: 'ETA',
	done: 'done',
	inProgress: 'in progress',
	pending: 'pending',
	slicesWord: 'slices',
});

export const renderProposalDetailHtml = (
	detail: IProposalDetail,
	copy: IViewCopy = viewCopyFor('en'),
): string => renderSharedProposalDetailHtml(detail, projectCopy(copy));

export const renderProposalDetailBody = (
	detail: IProposalDetail,
	copy: IViewCopy = viewCopyFor('en'),
): string => renderSharedProposalDetailBody(detail, projectCopy(copy));
