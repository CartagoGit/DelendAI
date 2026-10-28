// effect-boundary-authorized: writes the closure record inside a contained audit dir
/**
 * `<prefix>_audit_close` — the verifiable side of the audit protocol: claim a seat,
 * commit a Phase A file, check the evidence contract, and close the audit with a
 * recorded consensus.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import z from 'zod';

import {
	resolveExistingWorkspaceContained,
	toolError,
	toolJson,
} from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import type { IToolRegistration } from '@delendai/core/contracts';

import type { ICloseToolOptions } from '../contracts/interfaces/audit-protocol.interface';
import {
	AUDIT_CLOSURE_FILE,
	AUDIT_PROTOCOL_DIR,
	DEFAULT_CONSENSUS_THRESHOLD,
} from '../contracts/constants/audit-protocol.constant';
import {
	buildInventory,
	buildProposalInventory,
	checkEvidenceContract,
	computeConsensus,
	renderInventoryMarkdown,
} from '../services/audit-contract.service';
import { consolidateAudits } from '../services/audit-consolidate.service';
import {
	collectMarkdownFiles,
	resolveAuditDir,
} from '../services/audit-path-policy.service';
import {
	claimSeat,
	commitPhaseA,
	listSeats,
	readPhaseA,
} from '../services/audit-seats.service';
import { parseAuditFiles } from '../services/parse-audit.service';

const InputSchema = z.object({
	action: z.enum(['claim-seat', 'commit-phase-a', 'close']),
	auditDir: z.string().optional(),
	/** claim-seat and commit-phase-a. */
	reviewer: z.string().optional(),
	/** claim-seat. */
	seat: z.string().optional(),
	/** commit-phase-a: the reviewer's report, relative to the audit dir. */
	file: z.string().optional(),
	/** close: share of reviewers (0-1) that must report a finding. */
	threshold: z.number().min(0).max(1).optional(),
});

const OutputSchema = z.object({
	action: z.enum(['claim-seat', 'commit-phase-a', 'close']),
	ok: z.boolean(),
	reason: z.string().optional(),
	seat: z.string().optional(),
	reviewer: z.string().optional(),
	sha256: z.string().optional(),
	closed: z.boolean().optional(),
	pendingPhaseA: z.array(z.string()).optional(),
	incomplete: z
		.array(
			z.object({
				source: z.string(),
				findingId: z.string(),
				missing: z.array(z.string()),
			}),
		)
		.optional(),
	/** Share of the reviewers that must report a finding (close). */
	threshold: z.number().optional(),
	/** One entry per finding; the full record is written to the closure file. */
	consensus: z
		.array(
			z.object({
				id: z.string(),
				ratio: z.number(),
				consensus: z.boolean(),
			}),
		)
		.optional(),
	inventoryMarkdown: z.string().optional(),
});

type CloseArgs = z.infer<typeof InputSchema>;
type CloseOutput = z.infer<typeof OutputSchema>;

const refuse = (
	action: CloseArgs['action'],
	reason: string,
): ReturnType<typeof toolJson> =>
	toolJson({ action, ok: false, reason } satisfies CloseOutput);

export const buildCloseRegistration = (
	options: ICloseToolOptions,
): IToolRegistration => ({
	id: 'audit_close',
	summary:
		'Audit protocol: claim a reviewer seat (exclusive), commit a Phase A file, and close the audit with the evidence-contract check, the inventories and a recorded consensus per finding.',
	descriptionKey: 'audit_close',
	tags: ['audit', 'protocol'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_audit_close`,
			{
				description:
					"Audit protocol. `claim-seat { reviewer, seat }` takes a seat with an exclusive create (a held seat is refused). `commit-phase-a { reviewer, file }` hashes the reviewer's own report, which `audit_consolidate { reviewer }` requires before it reads the others. `close { threshold? }` lists the findings that miss required evidence fields, generates the finding and active-proposal inventories, and records the consensus and its threshold per finding once every seat holder has committed Phase A.",
				inputSchema: InputSchema,
				outputSchema: OutputSchema,
			},
			async (args: CloseArgs) => {
				const relDir = (
					args.auditDir ?? options.defaultAuditDir
				).replace(/^\.\//u, '');
				const resolved = await resolveAuditDir(
					options.workspaceRoot,
					relDir,
				);
				if (!resolved.ok) {
					return toolError(resolved.error, resolved.hint);
				}
				const absDir = resolved.abs;

				if (args.action === 'claim-seat') {
					if (
						args.reviewer === undefined ||
						args.seat === undefined
					) {
						return refuse(
							args.action,
							'claim-seat needs reviewer and seat',
						);
					}
					const held = (await listSeats(absDir)).find(
						(c) => c.reviewer === args.reviewer,
					);
					if (held !== undefined) {
						return refuse(
							args.action,
							`${args.reviewer} already holds seat "${held.seat}"`,
						);
					}
					const r = await claimSeat(absDir, args.seat, args.reviewer);
					return r.ok
						? toolJson({
								action: args.action,
								ok: true,
								seat: r.claim.seat,
								reviewer: r.claim.reviewer,
							} satisfies CloseOutput)
						: refuse(args.action, r.reason);
				}

				if (args.action === 'commit-phase-a') {
					if (
						args.reviewer === undefined ||
						args.file === undefined
					) {
						return refuse(
							args.action,
							'commit-phase-a needs reviewer and file',
						);
					}
					const r = await commitPhaseA(
						absDir,
						args.reviewer,
						args.file,
					);
					return r.ok
						? toolJson({
								action: args.action,
								ok: true,
								reviewer: r.commit.reviewer,
								sha256: r.commit.sha256,
							} satisfies CloseOutput)
						: refuse(args.action, r.reason);
				}

				const reader = new SafeWorkspaceReader(absDir);
				const docs: { path: string; body: string }[] = [];
				for (const name of await collectMarkdownFiles(absDir)) {
					try {
						docs.push({
							path: name,
							body: (await reader.readText(name)).content,
						});
					} catch {
						// An unreadable report is left out, as audit_consolidate does.
					}
				}
				const parsed = parseAuditFiles(docs);
				const consolidation = consolidateAudits(parsed);
				const threshold = args.threshold ?? DEFAULT_CONSENSUS_THRESHOLD;
				const consensus = computeConsensus(
					consolidation,
					consolidation.auditsFound,
					threshold,
				);
				const incomplete = checkEvidenceContract(parsed);
				const pendingPhaseA: string[] = [];
				for (const seat of await listSeats(absDir)) {
					if (
						(await readPhaseA(absDir, seat.reviewer)) === undefined
					) {
						pendingPhaseA.push(seat.reviewer);
					}
				}
				const proposals = await resolveExistingWorkspaceContained(
					options.workspaceRoot,
					options.proposalsRoot,
				);
				const inventoryMarkdown = renderInventoryMarkdown(
					buildInventory(parsed),
					proposals.ok
						? await buildProposalInventory(proposals.abs)
						: [],
				);
				const closed = pendingPhaseA.length === 0;
				if (closed) {
					const dir = path.join(absDir, AUDIT_PROTOCOL_DIR);
					await mkdir(dir, { recursive: true });
					await writeFile(
						path.join(dir, AUDIT_CLOSURE_FILE),
						JSON.stringify({ threshold, consensus }),
					);
				}
				return toolJson({
					action: args.action,
					ok: closed,
					...(closed
						? {}
						: {
								reason: 'Phase A is not committed by every seat holder',
							}),
					closed,
					pendingPhaseA,
					incomplete,
					threshold,
					consensus: consensus.map(
						({ id, ratio, consensus: agreed }) => ({
							id,
							ratio,
							consensus: agreed,
						}),
					),
					inventoryMarkdown,
				} satisfies CloseOutput);
			},
		);
	},
});
