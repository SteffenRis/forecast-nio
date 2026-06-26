import { describe, expect, it } from 'vitest'
import { parseCsv, tokenizeCsv } from '../parseCsv'

describe('tokenizeCsv', () => {
  it('splits simple comma rows', () => {
    expect(tokenizeCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('keeps commas inside quoted fields as one cell', () => {
    expect(tokenizeCsv('name,nav\n"Acme, LP",1000')).toEqual([
      ['name', 'nav'],
      ['Acme, LP', '1000'],
    ])
  })

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(tokenizeCsv('"He said ""hi"""')).toEqual([['He said "hi"']])
  })

  it('handles CRLF line endings and a trailing newline without a phantom row', () => {
    expect(tokenizeCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles a lone CR as a line ending', () => {
    expect(tokenizeCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a leading UTF-8 BOM from the first cell', () => {
    expect(tokenizeCsv('﻿name,nav\nAcme,1')).toEqual([
      ['name', 'nav'],
      ['Acme', '1'],
    ])
  })

  it('keeps a newline embedded inside quotes as part of one cell', () => {
    expect(tokenizeCsv('"line1\nline2",x')).toEqual([['line1\nline2', 'x']])
  })

  it('skips fully blank lines', () => {
    expect(tokenizeCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('tolerates ragged rows (short and long)', () => {
    expect(tokenizeCsv('a,b,c\n1\n1,2,3,4')).toEqual([
      ['a', 'b', 'c'],
      ['1'],
      ['1', '2', '3', '4'],
    ])
  })
})

describe('parseCsv', () => {
  it('returns header + rows, trimming header cells', () => {
    const res = parseCsv(' Fund , Date \nAcme,2024-03-31')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual({ header: ['Fund', 'Date'], rows: [['Acme', '2024-03-31']] })
  })

  it('reports empty for an empty / whitespace-only file', () => {
    expect(parseCsv('')).toEqual({ ok: false, error: 'empty' })
    expect(parseCsv('\n\n')).toEqual({ ok: false, error: 'empty' })
  })

  it('reports header-only when there are no data rows', () => {
    expect(parseCsv('a,b,c')).toEqual({ ok: false, error: 'header-only' })
  })
})
