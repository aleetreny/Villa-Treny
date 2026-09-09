import { z } from 'zod';
import { RESIDENTS } from '../residents';
import { canSpendCells } from './money';
import { RECORD_LIMITS as L, type AuthoredDraft, type RecordsState } from './record-types';

const resident = z.enum(RESIDENTS.map(r => r.id));
const stamp = z.number().int().nonnegative();
const id = z.string().regex(/^record:(draft|share|publication|intent|offer|agreement):\d+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const textBytes = (max: number) => z.string().min(1).refine(s => new TextEncoder().encode(s).length <= max);
const audience = z.union([z.literal('public'), resident]);
const binding = { draftId: id, contentHash: digest };
const references = z.array(z.strictObject({ id: z.string().min(1).max(160),
  audience: z.union([z.literal('public'), z.array(resident).min(1).max(25)]) })).max(L.refs);
const money = z.number().min(0).max(1000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8);
const terms = z.strictObject({ ...binding, author: resident, payer: resident, cells: money,
  dueWatch: stamp, audience });
const visibility = z.enum(['private', 'public']);

export function emptyRecordsState(): RecordsState {
  return { version: 1, nextId: 0, revision: 0, drafts: [], publications: [], shares: [], offers: [], agreements: [], intents: [],
    archive: { drafts: 0, publications: 0, parents: [] },
    cursors: Object.fromEntries(RESIDENTS.map(({id}) => [id, { revision: 0, lastSequence: -1, lastPublicationWatch: -1 }])) as RecordsState['cursors'] };
}

export const recordOperationSchema = z.union([
  z.strictObject({ kind: z.literal('draft'), title: textBytes(L.titleBytes), text: textBytes(L.contentBytes),
    refs: z.array(z.string().min(1).max(160)).max(L.refs), parent: z.strictObject(binding).nullable(),
    audience: z.union([audience, z.literal('private')]), publish: z.boolean() }),
  z.strictObject({ kind: z.enum(['share', 'schedule']), ...binding, audience }),
  z.strictObject({ kind: z.literal('cancel_publication'), intentId: id }),
  z.strictObject({ kind: z.literal('commission'), ...binding, counterpart: resident, cells: money,
    dueInWatches: z.number().int().min(1).max(16), audience, visibility }),
  z.strictObject({ kind: z.enum(['accept', 'reject']), offerId: id }),
]);

export const recordsStateSchema = z.strictObject({
  version: z.literal(1), nextId: stamp, revision: stamp,
  archive: z.strictObject({ drafts: stamp, publications: stamp,
    parents: z.array(z.strictObject({ ...binding, author: resident })).max(L.drafts) }),
  drafts: z.array(z.strictObject({ id, author: resident, title: textBytes(L.titleBytes), text: textBytes(L.contentBytes),
    refs: references, parent: z.strictObject(binding).nullable(), contentHash: digest,
    audience: z.union([audience, z.literal('private')]), createdAtMs: stamp, createdAtWatch: stamp })).max(L.drafts),
  publications: z.array(z.strictObject({ id, ...binding, author: resident, audience, atWatch: stamp,
    publishedAtMs: stamp })).max(L.publications),
  shares: z.array(z.strictObject({ id, ...binding, author: resident, audience, sharedAtMs: stamp })).max(L.shares),
  intents: z.array(z.strictObject({ id, ...binding, author: resident, audience,
    scheduledAtWatch: stamp, earliestWatch: stamp })).max(L.intents),
  offers: z.array(z.strictObject({ id, proposer: resident, counterpart: resident, terms, visibility,
    status: z.enum(['open', 'accepted', 'rejected', 'expired', 'replaced']),
    createdAtMs: stamp, createdAtWatch: stamp, expiresAtWatch: stamp })).max(L.offers),
  agreements: z.array(z.strictObject({ id, offerId: id, terms, visibility,
    status: z.enum(['active', 'payment_due', 'fulfilled', 'breached']), acceptedAtMs: stamp,
    acceptedAtWatch: stamp, acceptedAfterId: stamp, publicationId: id.nullable(),
    paidCells: z.number().nonnegative(), settledAtMs: stamp.nullable() })).max(L.agreements),
  cursors: z.record(resident, z.strictObject({ revision: stamp, lastSequence: z.number().int().min(-1),
    lastPublicationWatch: z.number().int().min(-1) })),
});

/** Portable synchronous SHA-256. Hash UTF-8 bytes, not JS UTF-16 code units. */
export function recordSha256(value: string): string {
  const data = new TextEncoder().encode(value), size = Math.ceil((data.length + 9) / 64) * 64;
  const bytes = new Uint8Array(size); bytes.set(data); bytes[data.length] = 128;
  const view = new DataView(bytes.buffer); view.setUint32(size - 4, data.length * 8);
  view.setUint32(size - 8, Math.floor(data.length / 0x20000000));
  const h: [number,number,number,number,number,number,number,number] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotr = (n: number, shift: number) => (n >>> shift) | (n << (32 - shift));
  const w = new Uint32Array(64);
  for (let offset = 0; offset < size; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15]!, b = w[i - 2]!;
      w[i] = w[i - 16]! + (rotr(a,7) ^ rotr(a,18) ^ (a >>> 3)) + w[i - 7]! + (rotr(b,17) ^ rotr(b,19) ^ (b >>> 10)); }
    let [a,b,c,d,e,f,g,j] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (j + (rotr(e,6) ^ rotr(e,11) ^ rotr(e,25)) + ((e & f) ^ (~e & g)) + k[i]! + w[i]!) | 0;
      const t2 = ((rotr(a,2) ^ rotr(a,13) ^ rotr(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,j].forEach((n,i) => { h[i] = (h[i]! + n) | 0; });
  }
  return h.map(n => (n >>> 0).toString(16).padStart(8,'0')).join('');
}

/** Canonical field order binds exact authored content, provenance and parent. */
export function recordContentHash(draft: Pick<AuthoredDraft, 'author'|'title'|'text'|'refs'|'parent'>): string {
  return recordSha256(JSON.stringify({ author: draft.author, title: draft.title, text: draft.text,
    refs: draft.refs.map(r => ({ id: r.id, audience: r.audience })), parent: draft.parent }));
}

export function validateRecordsState(value: unknown): { ok: true; value: RecordsState } | { ok: false; code: string } {
  const parsed = recordsStateSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: 'invalid_records_shape' };
  const state = parsed.data as RecordsState, ids = new Set<string>(), ordinals = new Set<number>();
  const fail = () => ({ ok: false as const, code: 'invalid_records_integrity' });
  for (const [kind, items] of Object.entries({ draft: state.drafts, publication: state.publications,
    share: state.shares, intent: state.intents, offer: state.offers, agreement: state.agreements }))
    for (const item of items) { const n = Number(item.id.split(':')[2]);
      if (!item.id.startsWith(`record:${kind}:`) || ids.has(item.id) || ordinals.has(n)
        || String(n) !== item.id.split(':')[2] || n >= state.nextId) return fail(); ids.add(item.id); ordinals.add(n); }
  const bound = (b: {draftId: string; contentHash: string}) => state.drafts.find(d => d.id === b.draftId && d.contentHash === b.contentHash);
  for (const d of state.drafts) {
    if (recordContentHash(d) !== d.contentHash || new TextEncoder().encode(d.title+d.text).length > L.contentBytes
      || new Set(d.refs.map(r => r.id)).size !== d.refs.length
      || d.refs.some(r => r.audience !== 'public' && (!r.audience.includes(d.author) || new Set(r.audience).size !== r.audience.length))) return fail();
    if (d.parent) { const p = bound(d.parent), archived = state.archive.parents.find(a => a.draftId === d.parent!.draftId
        && a.contentHash === d.parent!.contentHash);
      if ((!p && !archived) || (p?.author ?? archived?.author) !== d.author
      || Number(d.parent.draftId.split(':')[2]) >= Number(d.id.split(':')[2])) return fail(); }
  }
  if (new Set(state.archive.parents.map(p => p.draftId)).size !== state.archive.parents.length
    || state.archive.parents.some(p => !p.draftId.startsWith('record:draft:') || Number(p.draftId.split(':')[2]) >= state.nextId
      || state.drafts.some(d => d.id === p.draftId) || !state.drafts.some(d => d.parent?.draftId === p.draftId))) return fail();
  const mayShare = (d: AuthoredDraft, target: string) => d.refs.every(r => target === 'private'
    || (target === 'public' ? r.audience === 'public' : r.audience === 'public' || r.audience.some(id => id === target)));
  if (state.drafts.some(d => !mayShare(d,d.audience))) return fail();
  for (const x of [...state.shares,...state.publications,...state.intents]) {
    const d = bound(x); if (!d || d.author !== x.author || !mayShare(d,x.audience)) return fail();
    if ('publishedAtMs' in x && (x.publishedAtMs < d.createdAtMs || x.atWatch < d.createdAtWatch)) return fail();
    if ('scheduledAtWatch' in x && x.scheduledAtWatch < d.createdAtWatch) return fail();
  }
  if (new Set(state.intents.map(i => i.author)).size !== state.intents.length
    || new Set(state.publications.map(p => p.draftId)).size !== state.publications.length
    || new Set(state.publications.map(p => `${p.author}:${p.atWatch}`)).size !== state.publications.length
    || state.intents.some(i => i.earliestWatch < i.scheduledAtWatch || state.publications.some(p => p.draftId === i.draftId))
    || state.publications.some(p => state.cursors[p.author].lastPublicationWatch < p.atWatch)) return fail();
  for (const o of state.offers) { const d=bound(o.terms);
    if (!d || d.author !== o.terms.author || o.terms.author === o.terms.payer
      || ![o.terms.author,o.terms.payer].includes(o.proposer) || ![o.terms.author,o.terms.payer].includes(o.counterpart)
      || o.proposer === o.counterpart || o.expiresAtWatch <= o.createdAtWatch || o.terms.dueWatch <= o.createdAtWatch
      || (o.visibility === 'public' && d.audience !== 'public'
        && !state.shares.some(s=>s.draftId===d.id && s.audience==='public')
        && !state.publications.some(p=>p.draftId===d.id && p.audience==='public'))) return fail();
  }
  for (const a of state.agreements) {
    const o = state.offers.find(o => o.id === a.offerId), p = state.publications.find(p => p.id === a.publicationId);
    if (!o || o.status !== 'accepted' || JSON.stringify(o.terms) !== JSON.stringify(a.terms) || o.visibility !== a.visibility
      || a.acceptedAtMs < o.createdAtMs || a.acceptedAtWatch < o.createdAtWatch || a.acceptedAtWatch >= o.expiresAtWatch
      || a.acceptedAfterId !== Number(a.id.split(':')[2]) + 1 || a.acceptedAfterId > state.nextId
      || a.paidCells > a.terms.cells || (a.publicationId !== null && (!p || p.draftId !== a.terms.draftId
      || p.contentHash !== a.terms.contentHash || p.author !== a.terms.author || p.audience !== a.terms.audience
      || p.atWatch < a.acceptedAtWatch || p.publishedAtMs < a.acceptedAtMs || p.atWatch > a.terms.dueWatch
      || Number(p.id.split(':')[2]) < a.acceptedAfterId))
      || (['payment_due','fulfilled'].includes(a.status) !== (a.publicationId !== null))
      || (a.status === 'fulfilled') !== (a.settledAtMs !== null)
      || (a.status === 'fulfilled' && !canSpendCells(a.paidCells,a.terms.cells))
      || (a.status !== 'fulfilled' && a.paidCells !== 0)) return fail();
  }
  if (new Set(state.agreements.map(a => a.offerId)).size !== state.agreements.length) return fail();
  const active = state.agreements.filter(a=>a.status==='active');
  if (new Set(active.map(a=>a.terms.author)).size !== active.length) return fail();
  return { ok: true, value: state };
}
