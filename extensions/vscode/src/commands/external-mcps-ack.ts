/**
 * external-mcps-ack.ts — the human side of the external-server activation
 * gate, surfaced in the IDE (f00068 S5, gate decision 5).
 *
 * A thin host adapter over the plugin's `external_mcp_ack` tool (the same
 * f00098 provider-actions pattern: `formatToolName` + a `tryTool` that
 * degrades to `undefined` when the plugin is absent, and `showCommandError`
 * on failure). Two surfaces, one tool:
 *
 * - **Command** (`delendai.externalMcps.ack`): list pending activations →
 *   QuickPick a server → accept/reject → record the decision durably via
 *   the tool (which persists it under the plugin cache dir and emits its
 *   own non-modal host notification).
 * - **Notification** (`surfaceExternalMcpsPendingAcks`): a NON-MODAL toast
 *   ("N external server(s) awaiting activation approval") with a single
 *   `Review` action that opens the command. Non-modal by decision 5 — a
 *   modal would block agent flows.
 *
 * The tool is the source of truth; this module never writes the ledger
 * directly.
 */
import { formatToolName, type McpStdioClient } from '@delendai/client';

import {
	externalMcpsStringsByLang,
	type IExternalMcpsStrings,
} from '../i18n/external-mcps.strings';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import type { ICommandDeps, ICommandVscodeApi } from './types';
import { showCommandError } from './types';
import { HOST_LANG_KEY } from './setup-github';

export const EXTERNAL_MCPS_ACK_COMMAND = 'delendai.externalMcps.ack';

/** The `external_mcp_ack` tool suffix (host prefix is prepended at call time). */
const ACK_TOOL_SUFFIX = 'external-mcps_ack';

/** One pending activation as the ack tool projects it (subset we render). */
interface IPendingAckEntry {
	readonly serverId: string;
	readonly requestedAt: string;
	readonly reason?: string;
}

interface IAckListPayload {
	readonly ok: boolean;
	readonly mode: string;
	readonly total: number;
	readonly pending?: readonly IPendingAckEntry[];
}

/**
 * Solid-ISP: the notification + accept/reject dialog capabilities this
 * module needs beyond `ICommandVscodeApi`. Optional so existing hosts /
 * test fakes keep compiling; when a capability is absent the command
 * degrades gracefully (no notification / no decision path).
 */
export interface IExternalMcpsAckVscodeApi extends ICommandVscodeApi {
	readonly window: ICommandVscodeApi['window'] & {
		/** Non-modal toast with optional action buttons (decision 5). */
		showInformationMessage?(
			message: string,
			...actions: readonly string[]
		): Thenable<string | undefined>;
	};
}

export interface IExternalMcpsAckDeps extends Omit<ICommandDeps, 'vscode'> {
	readonly vscode: IExternalMcpsAckVscodeApi;
}

const stringsFor = (deps: IExternalMcpsAckDeps): IExternalMcpsStrings => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	const lang: Lang =
		typeof persisted === 'string' && persisted in dictsByLang
			? (persisted as Lang)
			: defaultLang;
	return externalMcpsStringsByLang[lang];
};

/** Call the ack tool; absent plugin (or any failure) → undefined. */
const tryAck = async <TOut>(
	client: McpStdioClient,
	prefix: string | undefined,
	args: object,
): Promise<TOut | undefined> => {
	try {
		return await client.request<object, TOut>(
			formatToolName(prefix, ACK_TOOL_SUFFIX),
			args,
		);
	} catch {
		return undefined;
	}
};

/** Read the pending activations the plugin is holding (empty on absence). */
const listPending = async (
	deps: IExternalMcpsAckDeps,
): Promise<readonly IPendingAckEntry[]> => {
	const payload = await tryAck<IAckListPayload>(
		deps.client,
		deps.namespacePrefix,
		{ list: true },
	);
	return payload?.pending ?? [];
};

/**
 * The command body, also reused by the notification's `Review` action:
 * pick a pending server, then accept/reject, then record the decision.
 */
const runAckFlow = async (deps: IExternalMcpsAckDeps): Promise<void> => {
	const s = stringsFor(deps);
	const pending = await listPending(deps);
	if (pending.length === 0) {
		await deps.vscode.window.showInformationMessage?.(
			`delendai: ${s.noPending}`,
		);
		return;
	}
	const serverPick = await deps.vscode.window.showQuickPick?.(
		pending.map((entry) => ({
			id: entry.serverId,
			label: entry.serverId,
			description: entry.reason ?? entry.requestedAt,
		})),
	);
	const serverId = serverPick?.id;
	if (serverId === undefined || serverId.length === 0) return;
	const decisionPick = await deps.vscode.window.showQuickPick?.([
		{ id: 'accept', label: s.accept, description: s.decidePrompt },
		{ id: 'reject', label: s.reject, description: s.decidePrompt },
	]);
	const decision = decisionPick?.id;
	if (decision !== 'accept' && decision !== 'reject') return;
	const accept = decision === 'accept';
	await deps.client.request(
		formatToolName(deps.namespacePrefix, ACK_TOOL_SUFFIX),
		{ server: serverId, accept },
	);
	await deps.vscode.window.showInformationMessage?.(
		`delendai: ${serverId} — ${accept ? s.acceptedInfo : s.rejectedInfo}`,
	);
};

/**
 * Non-modal pending-ack notification (decision 5). Best-effort: no
 * pending activations → no toast; `Review` opens the ack flow. Never
 * throws — a surfacing failure must not break activation.
 */
export const surfaceExternalMcpsPendingAcks = async (
	deps: IExternalMcpsAckDeps,
): Promise<void> => {
	try {
		const pending = await listPending(deps);
		if (pending.length === 0) return;
		const s = stringsFor(deps);
		const choice = await deps.vscode.window.showInformationMessage?.(
			`delendai: ${pending.length} ${s.pendingNotification}`,
			s.reviewAction,
		);
		if (choice === s.reviewAction) await runAckFlow(deps);
	} catch {
		// Surfacing is best-effort; the command remains the reliable path.
	}
};

export const registerExternalMcpsAckCommand = (deps: IExternalMcpsAckDeps) =>
	deps.vscode.commands.registerCommand(
		EXTERNAL_MCPS_ACK_COMMAND,
		async () => {
			try {
				await runAckFlow(deps);
			} catch (err) {
				await showCommandError(
					deps.vscode,
					'external-server activation ack',
					err,
				);
			}
		},
	);
