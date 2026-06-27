// Tool / prompt / resource / knowledge i18n catalogue — lookup helpers.
//
// `apps/web/src/i18n/tools/index.ts` imports each entry from
// `apps/web/src/i18n/tools/<name>.ts` and exposes lookup functions
// with English fallback. The catalogue starts empty by design (see
// `_shape.ts`) so the site falls back to the runtime description
// (always English) — that matches today's behaviour exactly. Future
// proposals populate the catalogue entry by entry.
//
// Lookup convention:
//   describeTool('mcp-vertex_deps_deps_check', 'es') → es → en → '' (never throws)

import type { Lang } from '#I18N/shared';
import type {
	IKnowledgeI18n,
	IPromptI18n,
	IResourceI18n,
	IToolI18n,
} from '#I18N/tools/_shape';
import { resolveToolsNamespacePrefix } from '../../../scripts/load-tools-i18n';
import { mcpVertexOverviewI18n } from '#I18N/tools/mcp-vertex_overview';
import { proposalsAutoWorkI18n } from '#I18N/tools/mcp-vertex_proposals_auto_work';
import { memorySaveI18n } from '#I18N/tools/mcp-vertex_memory_save';
import { auditPlanI18n } from '#I18N/tools/mcp-vertex_audit_plan';
import { auditConsolidateI18n } from '#I18N/tools/mcp-vertex_audit_consolidate';
import { depsDepsListI18n } from '#I18N/tools/mcp-vertex_deps_deps_list';
import { depsDepsCheckI18n } from '#I18N/tools/mcp-vertex_deps_deps_check';
import { depsDepsOutdatedI18n } from '#I18N/tools/mcp-vertex_deps_deps_outdated';
import { docsDocsListI18n } from '#I18N/tools/mcp-vertex_docs_docs_list';
import { docsDocsReadI18n } from '#I18N/tools/mcp-vertex_docs_docs_read';
import { docsDocsSearchI18n } from '#I18N/tools/mcp-vertex_docs_docs_search';
import { gitChangedI18n } from '#I18N/tools/mcp-vertex_git_changed';
import { gitDiffI18n } from '#I18N/tools/mcp-vertex_git_diff';
import { gitLogI18n } from '#I18N/tools/mcp-vertex_git_log';
import { gitStatusI18n } from '#I18N/tools/mcp-vertex_git_status';
import { logsCorrelateI18n } from '#I18N/tools/mcp-vertex_logs_correlate';
import { logsQueryI18n } from '#I18N/tools/mcp-vertex_logs_query';
import { logsRedactTestI18n } from '#I18N/tools/mcp-vertex_logs_redact_test';
import { logsSubscribeI18n } from '#I18N/tools/mcp-vertex_logs_subscribe';
import { logsTailI18n } from '#I18N/tools/mcp-vertex_logs_tail';
import { mcpVertexAnalyzeProjectI18n } from '#I18N/tools/mcp-vertex_analyze_project';
import { mcpVertexCreateProjectI18n } from '#I18N/tools/mcp-vertex_create_project';
import { mcpVertexGetValidationMatrixI18n } from '#I18N/tools/mcp-vertex_get_validation_matrix';
import { mcpVertexKnowledgeI18n } from '#I18N/tools/mcp-vertex_knowledge';
import { mcpVertexMetricsI18n } from '#I18N/tools/mcp-vertex_metrics';
import { mcpVertexPlanMcpProjectI18n } from '#I18N/tools/mcp-vertex_plan_mcp_project';
import { mcpVertexScaffoldI18n } from '#I18N/tools/mcp-vertex_scaffold';
import { mcpVertexStatusI18n } from '#I18N/tools/mcp-vertex_status';
import { memoryForgetI18n } from '#I18N/tools/mcp-vertex_memory_forget';
import { memoryListI18n } from '#I18N/tools/mcp-vertex_memory_list';
import { memoryRecallI18n } from '#I18N/tools/mcp-vertex_memory_recall';
import { notificationAwaitLockI18n } from '#I18N/tools/mcp-vertex_notification_await_lock';
import { notificationNotifyStatusI18n } from '#I18N/tools/mcp-vertex_notification_notify_status';
import { proposalsAgentLockI18n } from '#I18N/tools/mcp-vertex_proposals_agent_lock';
import { proposalsAgentLockReleaseOrphanI18n } from '#I18N/tools/mcp-vertex_proposals_agent_lock_release_orphan';
import { proposalsAgentNamesI18n } from '#I18N/tools/mcp-vertex_proposals_agent_names';
import { proposalsAgentWorktreeI18n } from '#I18N/tools/mcp-vertex_proposals_agent_worktree';
import { proposalsBranchGcI18n } from '#I18N/tools/mcp-vertex_proposals_branch_gc';
import { proposalsBranchStatusI18n } from '#I18N/tools/mcp-vertex_proposals_branch_status';
import { proposalsCloseSliceI18n } from '#I18N/tools/mcp-vertex_proposals_close_slice';
import { proposalsCompactStatusI18n } from '#I18N/tools/mcp-vertex_proposals_compact_status';
import { proposalsContinueProposalI18n } from '#I18N/tools/mcp-vertex_proposals_continue_proposal';
import { proposalsCreateProposalI18n } from '#I18N/tools/mcp-vertex_proposals_create_proposal';
import { proposalsDelegateI18n } from '#I18N/tools/mcp-vertex_proposals_delegate';
import { proposalsGetProposalWorkflowI18n } from '#I18N/tools/mcp-vertex_proposals_get_proposal_workflow';
import { proposalsPlanI18n } from '#I18N/tools/mcp-vertex_proposals_plan';
import { proposalsProposalAdoptI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_adopt';
import { proposalsProposalBoardI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_board';
import { proposalsProposalDiagnoseI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_diagnose';
import { proposalsProposalForceTransitionI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_force_transition';
import { proposalsProposalReconcileFolderI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_reconcile_folder';
import { proposalsProposalReviewI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_review';
import { proposalsProposalStaleListI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_stale_list';
import { proposalsProposalTransitionI18n } from '#I18N/tools/mcp-vertex_proposals_proposal_transition';
import { proposalsRoundContextI18n } from '#I18N/tools/mcp-vertex_proposals_round_context';
import { proposalsStateHealthI18n } from '#I18N/tools/mcp-vertex_proposals_state_health';
import { proposalsStateRepairI18n } from '#I18N/tools/mcp-vertex_proposals_state_repair';
import { proposalsSyncProposalsI18n } from '#I18N/tools/mcp-vertex_proposals_sync_proposals';
import { proposalsTaskQueueI18n } from '#I18N/tools/mcp-vertex_proposals_task_queue';
import { qualityGetQualityScopesI18n } from '#I18N/tools/mcp-vertex_quality_get_quality_scopes';
import { qualityQualityCancelI18n } from '#I18N/tools/mcp-vertex_quality_quality_cancel';
import { qualityRunQualityI18n } from '#I18N/tools/mcp-vertex_quality_run_quality';
import { rulesApplyRulesI18n } from '#I18N/tools/mcp-vertex_rules_apply_rules';
import { rulesCheckRulesI18n } from '#I18N/tools/mcp-vertex_rules_check_rules';
import { rulesGetRulesI18n } from '#I18N/tools/mcp-vertex_rules_get_rules';
import { searchSearchI18n } from '#I18N/tools/mcp-vertex_search_search';
import { statusMarkerCloseI18n } from '#I18N/tools/mcp-vertex_status-marker_close';
import { statusMarkerPingI18n } from '#I18N/tools/mcp-vertex_status-marker_ping';
import { statusMarkerValidateI18n } from '#I18N/tools/mcp-vertex_status-marker_validate';
import { testConventionGetConventionI18n } from '#I18N/tools/mcp-vertex_test-convention_get_convention';
import { testConventionScanDriftI18n } from '#I18N/tools/mcp-vertex_test-convention_scan_drift';
import { testConventionSuggestSpecPathI18n } from '#I18N/tools/mcp-vertex_test-convention_suggest_spec_path';

// ─── Catalogue storage ────────────────────────────────────────────────────────
// We use a module-level Map so additions via `register*` survive Astro's
// SSR. The shared i18n helper pattern (`./langs/<code>.ts`) populates
// its own dict at module import time; we mirror that pattern with a
// `register*` API so each catalogue entry can opt in lazily without
// forcing an import-time side effect on the whole app.

const tools = new Map<string, IToolI18n>();
const prompts = new Map<string, IPromptI18n>();
const resources = new Map<string, IResourceI18n>();
const knowledge = new Map<string, IKnowledgeI18n>();
const namespacePrefix = resolveToolsNamespacePrefix();
const namespacedToolName = (name: string): string => {
	if (name.startsWith(`${namespacePrefix}_`)) return name;
	if (name.startsWith('mcp-vertex_')) {
		return `${namespacePrefix}_${name.slice('mcp-vertex_'.length)}`;
	}
	return `${namespacePrefix}_${name}`;
};

export const registerToolI18n = (name: string, dict: IToolI18n): void => {
	tools.set(namespacedToolName(name), dict);
};
export const registerPromptI18n = (name: string, dict: IPromptI18n): void => {
	prompts.set(name, dict);
};
export const registerResourceI18n = (
	uri: string,
	dict: IResourceI18n,
): void => {
	resources.set(uri, dict);
};
export const registerKnowledgeI18n = (
	id: string,
	dict: IKnowledgeI18n,
): void => {
	knowledge.set(id, dict);
};

// ─── Catalogue entries (one per tool/prompt/resource/knowledge) ──────────────
// Each new catalogue file imports its `*I18n` constant above and registers it
// here. The lookup helpers below fall back to English, then to undefined, so a
// stale entry (key changed without updating the catalogue) is harmless: the
// runtime description still renders.
registerToolI18n('mcp-vertex_overview', mcpVertexOverviewI18n);
registerToolI18n('mcp-vertex_proposals_auto_work', proposalsAutoWorkI18n);
registerToolI18n('mcp-vertex_memory_save', memorySaveI18n);
// Every MCP tool exposed by a plugin is qualified in `assemble.ts` as
// `${corePrefix}_${pluginPrefix}_${toolId}` — e.g. `mcp-vertex_audit_audit_plan`.
// The catalogue is keyed on that full MCP tool name, not the plugin's
// internal slug, so we register under the namespaced form. The plugin
// sources stay agnostic of the host's core prefix; the qualification
// happens once, at boot, in `packages/core/src/lib/cli/assemble.ts`.
registerToolI18n('mcp-vertex_audit_audit_plan', auditPlanI18n);
registerToolI18n('mcp-vertex_audit_audit_consolidate', auditConsolidateI18n);
registerToolI18n('mcp-vertex_deps_deps_list', depsDepsListI18n);
registerToolI18n('mcp-vertex_deps_deps_check', depsDepsCheckI18n);
registerToolI18n('mcp-vertex_deps_deps_outdated', depsDepsOutdatedI18n);
registerToolI18n('mcp-vertex_docs_docs_list', docsDocsListI18n);
registerToolI18n('mcp-vertex_docs_docs_read', docsDocsReadI18n);
registerToolI18n('mcp-vertex_docs_docs_search', docsDocsSearchI18n);
registerToolI18n('mcp-vertex_git_changed', gitChangedI18n);
registerToolI18n('mcp-vertex_git_diff', gitDiffI18n);
registerToolI18n('mcp-vertex_git_log', gitLogI18n);
registerToolI18n('mcp-vertex_git_status', gitStatusI18n);
registerToolI18n('mcp-vertex_logs_correlate', logsCorrelateI18n);
registerToolI18n('mcp-vertex_logs_query', logsQueryI18n);
registerToolI18n('mcp-vertex_logs_redact_test', logsRedactTestI18n);
registerToolI18n('mcp-vertex_logs_subscribe', logsSubscribeI18n);
registerToolI18n('mcp-vertex_logs_tail', logsTailI18n);
registerToolI18n('mcp-vertex_analyze_project', mcpVertexAnalyzeProjectI18n);
registerToolI18n('mcp-vertex_create_project', mcpVertexCreateProjectI18n);
registerToolI18n(
	'mcp-vertex_get_validation_matrix',
	mcpVertexGetValidationMatrixI18n,
);
registerToolI18n('mcp-vertex_knowledge', mcpVertexKnowledgeI18n);
registerToolI18n('mcp-vertex_metrics', mcpVertexMetricsI18n);
registerToolI18n('mcp-vertex_plan_mcp_project', mcpVertexPlanMcpProjectI18n);
registerToolI18n('mcp-vertex_scaffold', mcpVertexScaffoldI18n);
registerToolI18n('mcp-vertex_status', mcpVertexStatusI18n);
registerToolI18n('mcp-vertex_memory_forget', memoryForgetI18n);
registerToolI18n('mcp-vertex_memory_list', memoryListI18n);
registerToolI18n('mcp-vertex_memory_recall', memoryRecallI18n);
registerToolI18n(
	'mcp-vertex_notification_await_lock',
	notificationAwaitLockI18n,
);
registerToolI18n(
	'mcp-vertex_notification_notify_status',
	notificationNotifyStatusI18n,
);
registerToolI18n('mcp-vertex_proposals_agent_lock', proposalsAgentLockI18n);
registerToolI18n(
	'mcp-vertex_proposals_agent_lock_release_orphan',
	proposalsAgentLockReleaseOrphanI18n,
);
registerToolI18n('mcp-vertex_proposals_agent_names', proposalsAgentNamesI18n);
registerToolI18n(
	'mcp-vertex_proposals_agent_worktree',
	proposalsAgentWorktreeI18n,
);
registerToolI18n('mcp-vertex_proposals_branch_gc', proposalsBranchGcI18n);
registerToolI18n(
	'mcp-vertex_proposals_branch_status',
	proposalsBranchStatusI18n,
);
registerToolI18n('mcp-vertex_proposals_close_slice', proposalsCloseSliceI18n);
registerToolI18n(
	'mcp-vertex_proposals_compact_status',
	proposalsCompactStatusI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_continue_proposal',
	proposalsContinueProposalI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_create_proposal',
	proposalsCreateProposalI18n,
);
registerToolI18n('mcp-vertex_proposals_delegate', proposalsDelegateI18n);
registerToolI18n(
	'mcp-vertex_proposals_get_proposal_workflow',
	proposalsGetProposalWorkflowI18n,
);
registerToolI18n('proposals_plan', proposalsPlanI18n);
registerToolI18n(
	'mcp-vertex_proposals_proposal_adopt',
	proposalsProposalAdoptI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_board',
	proposalsProposalBoardI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_diagnose',
	proposalsProposalDiagnoseI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_force_transition',
	proposalsProposalForceTransitionI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_reconcile_folder',
	proposalsProposalReconcileFolderI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_review',
	proposalsProposalReviewI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_stale_list',
	proposalsProposalStaleListI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_proposal_transition',
	proposalsProposalTransitionI18n,
);
registerToolI18n(
	'mcp-vertex_proposals_round_context',
	proposalsRoundContextI18n,
);
registerToolI18n('mcp-vertex_proposals_state_health', proposalsStateHealthI18n);
registerToolI18n('mcp-vertex_proposals_state_repair', proposalsStateRepairI18n);
registerToolI18n(
	'mcp-vertex_proposals_sync_proposals',
	proposalsSyncProposalsI18n,
);
registerToolI18n('mcp-vertex_proposals_task_queue', proposalsTaskQueueI18n);
registerToolI18n(
	'mcp-vertex_quality_get_quality_scopes',
	qualityGetQualityScopesI18n,
);
registerToolI18n('mcp-vertex_quality_quality_cancel', qualityQualityCancelI18n);
registerToolI18n('mcp-vertex_quality_run_quality', qualityRunQualityI18n);
registerToolI18n('mcp-vertex_rules_apply_rules', rulesApplyRulesI18n);
registerToolI18n('mcp-vertex_rules_check_rules', rulesCheckRulesI18n);
registerToolI18n('mcp-vertex_rules_get_rules', rulesGetRulesI18n);
registerToolI18n('mcp-vertex_search_search', searchSearchI18n);
registerToolI18n('mcp-vertex_status-marker_close', statusMarkerCloseI18n);
registerToolI18n('mcp-vertex_status-marker_ping', statusMarkerPingI18n);
registerToolI18n('mcp-vertex_status-marker_validate', statusMarkerValidateI18n);
registerToolI18n(
	'mcp-vertex_test-convention_get_convention',
	testConventionGetConventionI18n,
);
registerToolI18n('test-convention_scan_drift', testConventionScanDriftI18n);
registerToolI18n(
	'test-convention_suggest_spec_path',
	testConventionSuggestSpecPathI18n,
);

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Pick the localized value from a per-language map with English fallback. */
const pick = <V>(
	record: Readonly<Record<Lang, V>> | undefined,
	lang: Lang,
): V | undefined => {
	if (!record) return undefined;
	return record[lang] ?? record.en;
};

/** Description of a tool in the active language (falls back to English). */
export const describeTool = (name: string, lang: Lang): string | undefined => {
	const dict = tools.get(name);
	const v = pick(dict?.description, lang);
	return v;
};

// ─── Validation API ───────────────────────────────────────────────────────────
// Used by `apps/web/scripts/check-i18n.ts` to enforce 12-lang completeness on
// every catalogue entry that opted in. Tools NOT in the catalogue are exempt:
// joining the catalogue is opt-in (each plugin declares its own entries as
// they get translated). Joining means committing to 12-lang immediately, so
// the gate cannot drift silently.

/** All catalogue entries that opted in, in insertion order. */
export const listRegisteredTools = (): ReadonlyArray<{
	readonly name: string;
	readonly dict: IToolI18n;
}> => Array.from(tools.entries()).map(([name, dict]) => ({ name, dict }));

/** Description of a single tool argument, if the catalogue has one. */
export const describeToolArg = (
	name: string,
	arg: string,
	lang: Lang,
): string | undefined => {
	const dict = tools.get(name);
	const args = dict?.arguments?.[arg];
	return pick(args, lang);
};

/** Description of a prompt in the active language (falls back to English). */
export const describePrompt = (
	name: string,
	lang: Lang,
): string | undefined => {
	const dict = prompts.get(name);
	return pick(dict?.description, lang);
};

/** Description of a single prompt argument, if the catalogue has one. */
export const describePromptArg = (
	name: string,
	arg: string,
	lang: Lang,
): string | undefined => {
	const dict = prompts.get(name);
	return pick(dict?.arguments?.[arg], lang);
};

/** Localized resource name (falls back to English, then to caller-provided default). */
export const describeResourceName = (
	uri: string,
	lang: Lang,
): string | undefined => {
	const dict = resources.get(uri);
	return pick(dict?.name, lang);
};

/** Description of a resource in the active language. */
export const describeResource = (
	uri: string,
	lang: Lang,
): string | undefined => {
	const dict = resources.get(uri);
	return pick(dict?.description, lang);
};

/** Title of a knowledge entry in the active language. */
export const describeKnowledge = (
	id: string,
	lang: Lang,
): string | undefined => {
	const dict = knowledge.get(id);
	return pick(dict?.title, lang);
};
