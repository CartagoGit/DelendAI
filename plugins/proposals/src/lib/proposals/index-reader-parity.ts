/**
 * index-reader-parity.ts — whether the SQLite projection is level with
 * the registry, asked by a writer.
 *
 * Refreshing and reading have to agree on what "level" means. When the
 * writer used one rule ("the registry changed") and the reader another
 * ("the rows differ"), a projection could be stale in exactly the case
 * the writer never looked at — an index already current from an older
 * version, over a database that was never built — and the reader fell
 * back for good. So this asks the reader's own verdict, from the reader's
 * own sources, and nothing else.
 */
import {
	readFromJson,
	readFromSqlSource,
	type IProposalIndexReadOptions,
} from './index-reader';
import {
	decideIndexSource,
	type IIndexSourcePolicyResult,
} from './index-source-policy';

/**
 * The verdict `readProposalIndex` acts on, without serving anything,
 * recording a read, or emitting a notice.
 */
export const projectionParity = async (
	indexPathAbs: string,
	options?: IProposalIndexReadOptions,
): Promise<IIndexSourcePolicyResult['reason']> => {
	const fromSql = await readFromSqlSource(indexPathAbs, options);
	const fromJson = await readFromJson(indexPathAbs);
	return decideIndexSource({
		sql: fromSql?.entries ?? null,
		json: fromJson,
		metadata:
			fromSql === null
				? null
				: {
						sourceCommit: fromSql.sourceCommit,
						logicalDigest: fromSql.logicalDigest,
					},
	}).reason;
};
