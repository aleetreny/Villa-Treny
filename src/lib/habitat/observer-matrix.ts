import { RESIDENTS, type ResidentId } from './residents';
import type { Axis, Edge } from './weave';

export function matrixStep(from: ResidentId, to: ResidentId, key: string): [ResidentId, ResidentId] {
  const ids = RESIDENTS.map((person) => person.id);
  const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[key];
  if (!delta) return [from, to];
  let row = ids.indexOf(from), column = ids.indexOf(to);
  do {
    row = (row + delta[0]! + ids.length) % ids.length;
    column = (column + delta[1]! + ids.length) % ids.length;
  } while (row === column);
  return [ids[row]!, ids[column]!];
}
export function axisGap(edge: Edge, reverse: Edge, axis: Axis): number {
  return Math.abs(edge.axes[axis] - reverse.axes[axis]);
}
