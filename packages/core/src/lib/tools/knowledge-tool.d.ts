import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
/**
 * On-demand access to the knowledge contributed by plugins. Listing
 * returns only ids+titles (cheap); fetching one returns its body. This
 * keeps an agent's context small: it reads a doc only when it needs it,
 * instead of paying for every plugin's prose up front.
 */
export declare const buildKnowledgeToolRegistration: (namespacePrefix: string, knowledge: () => readonly IKnowledgeEntry[]) => IToolRegistration;
