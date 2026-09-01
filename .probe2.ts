import { resolve } from 'node:path';
import { hasIndependentApprovalSinceLastReview } from './plugins/proposals/src/lib/shared/peer-review-log';
const p = resolve('.cache/mcp-vertex/results/logs/peer-review.jsonl');
console.log('approved =', await hasIndependentApprovalSinceLastReview(p, 'f00201'));
