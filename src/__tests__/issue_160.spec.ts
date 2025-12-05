import { EntryCSLAdapter, EntryDataCSL } from '../types';

describe('Issue 160: Year subtraction bug', () => {
  const createEntry = (dateParts: (string | number)[]): EntryCSLAdapter => {
    const data: EntryDataCSL = {
      id: 'test-entry',
      type: 'article-journal',
      issued: {
        'date-parts': [dateParts],
      },
    };
    return new EntryCSLAdapter(data);
  };

  test('should return correct year for simple year [2017]', () => {
    const entry = createEntry([2017]);
    expect(entry.year).toBe(2017);
  });

  test('should return correct year for year-month-day [2017, 1, 15]', () => {
    const entry = createEntry([2017, 1, 15]);
    expect(entry.year).toBe(2017);
  });

  test('should return correct year for year-month-day [2017, 4, 15]', () => {
    // April 15th, 2017
    const entry = createEntry([2017, 4, 15]);
    expect(entry.year).toBe(2017);
  });

  test('should return correct year for start of year [2017, 1, 1]', () => {
    // Jan 1st 2017
    const entry = createEntry([2017, 1, 1]);
    expect(entry.year).toBe(2017);
  });

  test('should return correct year even if date parts are strings', () => {
    const entry = createEntry(['2017', '1', '1']);
    expect(entry.year).toBe(2017);
  });
});
