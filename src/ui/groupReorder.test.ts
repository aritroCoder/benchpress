import { describe, expect, it } from 'vitest'
import { collapseBlock } from './groupReorder'

const PLAN = ['w', 'b', 'd', 't', 'o']

describe('collapseBlock', () => {
  it('dragging the lower item of a block down carries the block, plan order kept', () => {
    // selected b+d, user dragged d to the end → Reorder produced [w,b,t,o,d]
    expect(collapseBlock(['w', 'b', 't', 'o', 'd'], 'd', new Set(['b', 'd']), PLAN)).toEqual([
      'w',
      't',
      'o',
      'b',
      'd',
    ])
  })

  it('dragging the upper item of a block to the top carries the block', () => {
    // selected d+t, user dragged t above w → Reorder produced [t,w,b,d,o]
    expect(collapseBlock(['t', 'w', 'b', 'd', 'o'], 't', new Set(['d', 't']), PLAN)).toEqual([
      'd',
      't',
      'w',
      'b',
      'o',
    ])
  })

  it('drop into the middle inserts the block between non-selected neighbours', () => {
    // selected w+o, user dragged o between b and d → [w,b,o,d,t]
    expect(collapseBlock(['w', 'b', 'o', 'd', 't'], 'o', new Set(['w', 'o']), PLAN)).toEqual([
      'b',
      'w',
      'o',
      'd',
      't',
    ])
  })

  it('single selection degrades to a plain reorder passthrough', () => {
    expect(collapseBlock(['b', 'w', 'd', 't', 'o'], 'b', new Set(['b']), PLAN)).toEqual(['b', 'w', 'd', 't', 'o'])
  })

  it('dragged id outside the selection or the day leaves order untouched', () => {
    expect(collapseBlock(['w', 'b', 'd', 't', 'o'], 'b', new Set(['d', 't']), PLAN)).toEqual(PLAN)
    expect(collapseBlock(PLAN, 'x', new Set(['x', 'b']), PLAN)).toEqual(PLAN)
  })

  it('selected ids not present in this day are ignored, result stays a permutation', () => {
    expect(collapseBlock(['w', 'b', 'd'], 'b', new Set(['b', 'zz']), ['w', 'b', 'd', 'zz'])).toEqual(['w', 'b', 'd'])
  })
})
