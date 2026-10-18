import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import { BORDA_METHOD, type Ballot, type VerdictResult } from './contracts';

const POINTS = [5, 4, 3, 2, 1] as const;
export const TIE_RULES = [
  'Total Borda points (5 for first place down to 1 for fifth).',
  'Number of first-place rankings.',
  'Head-to-head: among voters who are neither of the tied residents, who was ranked higher more often.',
  'Number of second-, then third-, fourth- and fifth-place rankings.',
  'A remaining perfect tie is reported as a joint result.',
];

type Tally = { id: CharacterId; points: number; firsts: number; positions: number[] };
export function tally(ballots: Partial<Record<CharacterId, Ballot>>): Tally[] {
  return CHARACTER_IDS.map(id => {
    const positions = [0, 0, 0, 0, 0];
    let points = 0;
    for (const ballot of Object.values(ballots)) {
      const index = ballot?.ranking.indexOf(id) ?? -1;
      if (index >= 0) { positions[index]! += 1; points += POINTS[index]!; }
    }
    return { id, points, firsts: positions[0]!, positions };
  });
}
/** Wins for a over b, counted only among voters who are neither a nor b. */
export function headToHead(ballots: Partial<Record<CharacterId, Ballot>>, a: CharacterId, b: CharacterId): number {
  let wins = 0;
  for (const [voter, ballot] of Object.entries(ballots) as [CharacterId, Ballot | undefined][]) {
    if (!ballot || voter === a || voter === b) continue;
    if (ballot.ranking.indexOf(a) < ballot.ranking.indexOf(b)) wins++;
  }
  return wins;
}

type Rule = { name: string; key: (t: Tally, group: Tally[]) => number };
/** Applies the predefined rules in order to one tied group; returns ordered
 * subgroups with the rule that separated them. Never invents a distinction. */
function separate(group: Tally[], ballots: Partial<Record<CharacterId, Ballot>>, from: number): { members: Tally[]; decidedBy: string }[] {
  const rules: Rule[] = [
    { name: 'first places', key: t => t.firsts },
    { name: 'head-to-head', key: (t, g) => g.filter(o => o.id !== t.id).reduce((n, o) => n + headToHead(ballots, t.id, o.id) - headToHead(ballots, o.id, t.id), 0) },
    { name: 'second places', key: t => t.positions[1]! },
    { name: 'third places', key: t => t.positions[2]! },
    { name: 'fourth places', key: t => t.positions[3]! },
    { name: 'fifth places', key: t => t.positions[4]! },
  ];
  for (let r = from; r < rules.length; r++) {
    const rule = rules[r]!;
    const keyed = group.map(t => ({ t, k: rule.key(t, group) }));
    const values = [...new Set(keyed.map(x => x.k))].sort((a, b) => b - a);
    if (values.length < 2) continue;
    // Split on this rule. A smaller tied group restarts at head-to-head, which
    // is recomputed among its own members; earlier rules are already equal.
    return values.flatMap(value => {
      const members = keyed.filter(x => x.k === value).map(x => x.t);
      return members.length === 1 ? [{ members, decidedBy: rule.name }] : separate(members, ballots, 1);
    });
  }
  return [{ members: group, decidedBy: 'joint' }];
}

/** Final Borda standings. Requires all six valid ballots; a partial jury
 * would give residents unequal numbers of opportunities to receive points. */
export function verdict(ballots: Partial<Record<CharacterId, Ballot>>): VerdictResult | null {
  if (CHARACTER_IDS.some(id => !ballots[id])) return null;
  const tallies = tally(ballots);
  const byPoints = [...new Set(tallies.map(t => t.points))].sort((a, b) => b - a);
  const ordered: { members: Tally[]; decidedBy: string }[] = [];
  for (const points of byPoints) {
    const group = tallies.filter(t => t.points === points);
    if (group.length === 1) ordered.push({ members: group, decidedBy: 'points' });
    else ordered.push(...separate(group, ballots, 0));
  }
  let rank = 1;
  const standings: VerdictResult['standings'] = [];
  for (const part of ordered) {
    for (const t of part.members) standings.push({ ...t, rank, decidedBy: part.decidedBy });
    rank += part.members.length;
  }
  const winners = standings.filter(s => s.rank === 1).map(s => s.id);
  const leader = standings[0]!;
  const tieNote = winners.length > 1 ? 'A perfect tie under every predefined rule: joint winners.'
    : leader.decidedBy !== 'points' ? `Tied on points; separated by ${leader.decidedBy}.` : null;
  return { method: BORDA_METHOD, standings, winners, tieNote };
}
