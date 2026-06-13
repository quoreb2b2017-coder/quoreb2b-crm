import {
  assignedParentRowIndices,
  equalSplitIndices,
  unassignedParentRowIndices,
} from './batch-distribute.util';

describe('batch-distribute.util', () => {
  it('splits indices equally with no duplicates', () => {
    const buckets = equalSplitIndices([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
    const flat = buckets.flat().sort((a, b) => a - b);
    expect(flat).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(buckets[0]).toHaveLength(4);
    expect(buckets[1]).toHaveLength(3);
    expect(buckets[2]).toHaveLength(3);
  });

  it('tracks assigned parent rows from parentSourceRowIndices', () => {
    const assigned = assignedParentRowIndices(
      ['A'],
      [['1'], ['2'], ['3'], ['4']],
      [{ headers: ['A'], rows: [['2']], parentSourceRowIndices: [1] }],
    );
    expect([...unassignedParentRowIndices(4, assigned)]).toEqual([0, 2, 3]);
  });
});
