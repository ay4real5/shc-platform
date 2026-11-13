import { IMPORT_COLUMNS, importHeaderKey, importTemplateCsv, parseCsv, parseUkDate, parseYesNo } from './staff-import.js';

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
    ]);
  });
  it('drops the Excel byte-order mark and blank lines, and keeps a last line with no newline', () => {
    expect(parseCsv('﻿name,role\n\n,\nAnn,Nurse')).toEqual([
      ['name', 'role'],
      ['Ann', 'Nurse'],
    ]);
  });
  it('keeps empty cells', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });
});

describe('parseUkDate', () => {
  it.each([
    ['14/03/2022', '2022-03-14'],
    ['4/3/2022', '2022-03-04'],
    ['14-03-2022', '2022-03-14'],
    ['14.03.2022', '2022-03-14'],
    ['2022-03-14', '2022-03-14'],
    [' 01/12/2025 ', '2025-12-01'],
  ])('%s → %s', (input, out) => expect(parseUkDate(input)).toBe(out));
  it.each(['31/02/2022', '14/13/2022', '14/03/22', 'March 2022', '', '03/14/2022'])('refuses %s', (input) => expect(parseUkDate(input)).toBeNull());
});

describe('parseYesNo', () => {
  it('reads yes, no and blank, and flags anything else', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo(' y ')).toBe(true);
    expect(parseYesNo('')).toBe(false);
    expect(parseYesNo('No')).toBe(false);
    expect(parseYesNo('maybe')).toBeNull();
  });
});

describe('the template', () => {
  it('has unique headers that read back as the columns', () => {
    const keys = IMPORT_COLUMNS.map((c) => importHeaderKey(c.header));
    expect(new Set(keys).size).toBe(keys.length);
    const [headers, sample] = parseCsv(importTemplateCsv());
    expect(headers.map(importHeaderKey)).toEqual(keys);
    expect(sample).toHaveLength(IMPORT_COLUMNS.length);
  });
  it('uses an obviously fake sample person', () => {
    expect(importTemplateCsv()).toContain('sample.person@example.com');
  });
});
