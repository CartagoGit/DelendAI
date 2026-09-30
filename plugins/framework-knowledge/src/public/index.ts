/**
 * Public surface of `@delendai/framework-knowledge`.
 *
 * Exported as pure functions/types so a peer plugin (f00548, f00550)
 * can build on the knowledge-record shape without importing
 * `src/index.ts`, which has side effects through `definePlugin`.
 */

export { default } from '../index';

export {
	createKnowledgeRecord,
	FORCE_VALUES,
	forceRank,
	isKnowledgeForce,
} from '../lib/knowledge/knowledge-record';
export type {
	ICreateKnowledgeRecordResult,
	IKnowledgeEvidence,
	IKnowledgeForce,
	IKnowledgeRecord,
	IKnowledgeRecordInput,
} from '../lib/contracts/interfaces/knowledge-record.interface';
