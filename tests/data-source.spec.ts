jest.mock('obsidian', () => ({}), { virtual: true });

import { isZoteroBbtConfig, DATA_SOURCE_TYPES } from '../src/data-source';
import { DATABASE_FORMATS } from '../src/core';

/**
 * The single predicate deciding "is this database a live Zotero (Better
 * BibTeX) pull" — shared by SourceManager transport routing and the settings
 * UI. These tests pin the contract both sides rely on.
 */
describe('isZoteroBbtConfig', () => {
  it('is true for the zotero sourceType on a BBT-exportable format', () => {
    for (const type of [DATABASE_FORMATS.CslJson, DATABASE_FORMATS.BibLaTeX]) {
      expect(
        isZoteroBbtConfig({ type, sourceType: DATA_SOURCE_TYPES.Zotero }),
      ).toBe(true);
    }
  });

  it('is false for formats BBT cannot export (stale/hand-edited sourceType)', () => {
    for (const type of [
      DATABASE_FORMATS.Hayagriva,
      DATABASE_FORMATS.Readwise,
      DATABASE_FORMATS.ZoteroApi,
    ]) {
      expect(
        isZoteroBbtConfig({ type, sourceType: DATA_SOURCE_TYPES.Zotero }),
      ).toBe(false);
    }
  });

  it('is false without the explicit zotero sourceType', () => {
    expect(isZoteroBbtConfig({ type: DATABASE_FORMATS.CslJson })).toBe(false);
    expect(
      isZoteroBbtConfig({
        type: DATABASE_FORMATS.CslJson,
        sourceType: DATA_SOURCE_TYPES.LocalFile,
      }),
    ).toBe(false);
  });
});
