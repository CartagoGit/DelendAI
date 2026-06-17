import type { IPromptRegistration } from '../contracts/interfaces/tool-registration.interface';
/**
 * A workflow prompt that gives clients a one-click "get started" entry
 * (slash-command-like UX). It simply tells the agent to call the
 * `overview` tool first and then follow the recommended next action —
 * the cheapest possible orientation for any model.
 */
export declare const buildStartPromptRegistration: (namespacePrefix: string, recommendedNextAction: () => string) => IPromptRegistration;
