import { describe, expect, it } from 'vitest'
import { autoMatchFund, normalizeFundName, type FundLike } from '../matchFunds'

const funds: FundLike[] = [
  { id: 'f_acme7', name: 'Acme VII' },
  { id: 'f_acme8', name: 'Acme VIII' },
  { id: 'f_blue', name: 'Blue Harbor Growth Fund' },
]

describe('normalizeFundName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeFundName('  Acme,  VII. ')).toBe('acme vii')
  })
})

describe('autoMatchFund', () => {
  it('matches case/punctuation-insensitive identical names exactly', () => {
    expect(autoMatchFund('acme vii', funds)).toEqual({ kind: 'exact', fundId: 'f_acme7' })
    expect(autoMatchFund('Acme  VII.', funds)).toEqual({ kind: 'exact', fundId: 'f_acme7' })
  })

  it('heuristically matches when only structural noise words differ', () => {
    expect(autoMatchFund('Acme Partners VII', funds)).toEqual({ kind: 'heuristic', fundId: 'f_acme7' })
    expect(autoMatchFund('Acme Capital VII Fund LP', funds)).toEqual({ kind: 'heuristic', fundId: 'f_acme7' })
  })

  it('keeps version tokens significant — VII never matches VIII', () => {
    expect(autoMatchFund('Acme VII', [{ id: 'f_acme8', name: 'Acme VIII' }])).toEqual({ kind: 'none' })
  })

  it('does not match a bare family name to a numbered fund', () => {
    expect(autoMatchFund('Acme', funds)).toEqual({ kind: 'none' })
  })

  it('returns none when two system funds are equally plausible', () => {
    const ambiguous: FundLike[] = [
      { id: 'a', name: 'Summit Fund' },
      { id: 'b', name: 'Summit Partners' },
    ]
    expect(autoMatchFund('Summit', ambiguous)).toEqual({ kind: 'none' })
  })

  it('returns none when there are no funds', () => {
    expect(autoMatchFund('Acme VII', [])).toEqual({ kind: 'none' })
  })
})
