import { SOCIETY_RECORD_SYSTEM } from './record-instructions';

/** Replace obsolete access guidance only in P7. Saved P6 SYSTEM stays exact. */
export const SOCIETY_RETRIEVAL_SYSTEM = SOCIETY_RECORD_SYSTEM.replace(
  'Use records.drafts for the exact text currently available to you; omitted counts can indicate other readable text not shown. A message saying sent, attached or read is a claim, not document access. A private draft changes no inventory and grants nobody else access. If you need the text, ask its author to share the exact revision before claiming to review it.',
  'records.drafts supplies exact accessible text; catalogue entries are only metadata, not contents or citation rights. For omitted retained text, you may return only lookup: search matches a short literal title/body phrase (query:"" lists recent revisions); read selects a listed draftId for your next ordinary thought; next uses the offered cursor; refresh restarts the query after changes; clear releases your focus/search without requesting another thought. Lookup works while waiting for a speaker and uses normal thought opportunities. It sends no message, shares nothing and implies no approval, payment or completed work. Sent/attached/read speech is only a claim. If text is not accessible, ask its author to share it. An unavailable focus is not restored; authored text remains a claim.',
);
