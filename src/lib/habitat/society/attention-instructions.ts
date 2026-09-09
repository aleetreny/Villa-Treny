import { SOCIETY_RETRIEVAL_SYSTEM } from './retrieval-instructions';
import { SOCIETY_ATTENTION_COMPACT_CANDIDATE_SYSTEM } from './attention-instructions-candidate';

/** Selected P8 wording; earlier issued protocols retain their own exact contract. */
export const SOCIETY_ATTENTION_SYSTEM = SOCIETY_ATTENTION_COMPACT_CANDIDATE_SYSTEM;

/** Verbose local baseline retained for offline comparison; never issued by default. */
export const SOCIETY_ATTENTION_VERBOSE_BASELINE_SYSTEM = SOCIETY_RETRIEVAL_SYSTEM.replace(
  'Your first available opportunity includes a message, without having to disclose a private purpose. If conversation is null, no exchange is active. receivedClosure, when present, contains a final received message to consider. It is not an active reply obligation; private work or a new contact must follow the schema. Otherwise answer the actual last speaker on your turn, without repeating their sentence or your earlier reply. Use one or two short, complete sentences. Ask one relevant question or propose one concrete next step.',
  'You choose where to give your attention. channels contains only your own exchanges, with the latest exact message from each participant; earlier omitted turns are not available evidence. An open exchange does not require an immediate reply and does not prevent private work or another contact. Reply to the selected speaker in one or two short English sentences when useful. No follow-up question is required. Waiting for an actual physical event is legitimate; repeating a promise does not perform it.',
).replace(
  'Return only the requested JSON. Omit unchanged or unnecessary fields.',
  'Return only {attention,content}, or the exclusive {lookup} operation. attention.kind is reply with the offered conversationId; contact with no conversationId; private with an offered conversationId or null; or leave with its offered conversationId and content:{}. reply/contact require content.message to that counterpart. private sends no message or deal; it can review a selected exchange, change your own plan, write or share a record, reflect, or keep your current purpose with content:{}. Before you have a purpose, private still requires content.project. private with null reviews no exchange. leave closes that exchange without inventing farewell words: only its unaccepted conversation proposals expire; accepted commitments and document commissions remain. Choose one attention operation per thought. Omit unchanged or unnecessary content fields.',
).replace(
  'If no offered capability achieves your purpose, use steps:[] and pursue a concrete discussion in a message.',
  'If no offered capability achieves your purpose, use steps:[]; you may discuss it, write accessible text or wait, without representing speech as physical work.',
) + '\n\nAt most three open channels per resident and one per pair. Available contacts reflect both people\'s capacity, not willingness, location or consent. You can leave while waiting for the other person. Selecting a channel acknowledges only its supplied revision; another channel or lookup does not consume it. Acknowledgement is not endorsement, comprehension or agreement. Offers belong to the exact selected channel; only its supplied incoming offerId can be accepted. Keep a useful pending step until its physical watch unless evidence gives you a reason to change it.';
