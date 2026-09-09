# Proposed English presentation of three historical public messages

This is a presentation-only proposal prepared from a verified complete SQL8 recovery cut. No application code, stored message, API response, model input or raw backup was changed. The [exact match matrix](public-dialogue-translations-115.json) contains only the three already-public messages and their Journal copies. Their Spanish source bytes and SHA256 digests remain explicit.

## Exact scope

All three messages belong to `conversation:115`, participants P and V. They were issued under earlier protocol3 jobs; translating their display must not reinterpret those jobs. The proposed English text preserves the original offers, family-style address, bread/oven metaphor and requests without supplying missing supplies, location or completed work.

| Turn / author | Journal record | Proposed displayed English |
| --- | --- | --- |
| `turn:116` / P | `habitat-canonical:mind:P:0:22:g:3:turn:116` | Vero, my dear! Shall I teach you to make bread before you leave? Come on, I'll put it in your hand. |
| `turn:155` / V | `habitat-canonical:mind:V:1:30:g:3:turn:155` | Of course, Pilar! Give me a hand with the dough; I don't want my own oven to be just a metaphor. |
| `turn:227` / P | `habitat-canonical:mind:P:3:43:g:3:turn:227` | Come on, Vero, my dear! Put in the flour and water, and I'll teach you to knead with rhythm. Ready? |

## Shared rendering contract

Use one small pure presentation module and one visible label, **English translation**, in both Journal and Lives. The module owns this immutable three-entry allowlist; neither component contains its own translation copy.

- Lives: require an exact match of conversation ID, turn ID, speaker, timestamp and full source text. Its current rendering point is `AgencyNotebook.tsx:88`.
- Journal: the current public `ArchiveEntry` does not contain a happening ID. Require exact full prefixed source text plus day, watch, minute, canonical room and participant IDs from the matrix. Its current rendering point is `HabitatView.tsx:177`. Do not add an API field solely for this display correction.
- On any mismatch, return the original text with no translation label. Do not use substring replacement, fuzzy matching, accent removal or a language detector. Keep the original `P:` / `V:` prefix in Journal.
- Render the returned text as ordinary escaped React text; retain the translated resident attribution and timestamps. Attach the visible `English translation` label only to matched entries. An optional original-text disclosure can expose these same public Spanish bytes without requesting another service.
- All saved history, archive/API content, model context and raw backups remain original. This is not a general automatic translator and does not correct the substance of a resident’s claim.

## Required local checks after authorization

Check all three exact Lives/Journal pairs resolve to the same English body and label. Check a one-character source change, wrong turn/conversation/speaker, wrong Journal room/day/watch or unrelated message returns untouched original text. A component fixture should render the translation in both views and retain the filter/profile behavior. Verify input objects are unchanged and no network call is introduced.

The current probe owner has reported sources released, but this document contains no implementation. The release owner decides when to apply the shared UI patch.
