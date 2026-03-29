import { generateDatabaseId } from '../../src/core/types/database';

jest.mock('obsidian', () => ({}), { virtual: true });

describe('generateDatabaseId', () => {
  it('returns string matching db-{timestamp}-{random4} format', () => {
    const id = generateDatabaseId();
    expect(id).toMatch(/^db-\d+-[a-z0-9]{4}$/);
  });

  it('two consecutive calls return different ids', () => {
    const id1 = generateDatabaseId();
    const id2 = generateDatabaseId();
    expect(id1).not.toBe(id2);
  });

  it('starts with "db-" prefix', () => {
    const id = generateDatabaseId();
    expect(id.startsWith('db-')).toBe(true);
  });

  it('contains a numeric timestamp portion', () => {
    const before = Date.now();
    const id = generateDatabaseId();
    const after = Date.now();

    // Extract timestamp from id
    const parts = id.split('-');
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
