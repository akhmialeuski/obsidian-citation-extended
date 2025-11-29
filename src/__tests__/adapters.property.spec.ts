import * as fc from 'fast-check';
import {
  EntryCSLAdapter,
  EntryBibLaTeXAdapter,
  EntryDataCSL,
  EntryDataBibLaTeX,
} from '../types';

describe('Adapters Property Testing', () => {
  describe('EntryCSLAdapter', () => {
    it('should handle any valid CSL data without crashing', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string(),
            type: fc.string(),
            title: fc.option(fc.string(), { nil: undefined }),
            author: fc.option(
              fc.array(
                fc.record({
                  given: fc.option(fc.string(), { nil: undefined }),
                  family: fc.option(fc.string(), { nil: undefined }),
                }),
              ),
              { nil: undefined },
            ),
            issued: fc.option(
              fc.record({
                'date-parts': fc.tuple(
                  fc.array(fc.oneof(fc.integer(), fc.string())),
                ),
              }),
              { nil: undefined },
            ),
            // Add more fields as needed
          }),
          (data) => {
            const adapter = new EntryCSLAdapter(data as EntryDataCSL);
            expect(adapter.id).toBe(data.id);
            expect(adapter.type).toBe(data.type);
            // Accessing other properties shouldn't throw
            if (data.title) {
              expect(adapter.title).toBeDefined();
            }
            if (data.author) {
              expect(adapter.authorString).toBeDefined();
            }
            if (
              data.issued &&
              data.issued['date-parts'] &&
              data.issued['date-parts'][0].length > 0
            ) {
              expect(adapter.year).toBeDefined();
            }
          },
        ),
      );
    });
  });

  describe('EntryBibLaTeXAdapter', () => {
    it('should handle any valid BibLaTeX data without crashing', () => {
      fc.assert(
        fc.property(
          fc.record({
            key: fc.string(),
            type: fc.string(),
            fields: fc.dictionary(
              fc.string(),
              fc.oneof(fc.string(), fc.array(fc.string())),
            ),
            creators: fc.record({
              author: fc.option(
                fc.array(
                  fc.record({
                    firstName: fc.option(fc.string(), { nil: undefined }),
                    lastName: fc.option(fc.string(), { nil: undefined }),
                    prefix: fc.option(fc.string(), { nil: undefined }),
                    suffix: fc.option(fc.string(), { nil: undefined }),
                    literal: fc.option(fc.string(), { nil: undefined }),
                  }),
                ),
                { nil: undefined },
              ),
            }),
          }),
          (data) => {
            const adapter = new EntryBibLaTeXAdapter(
              data as unknown as EntryDataBibLaTeX,
            );
            expect(adapter.id).toBe(data.key);
            expect(adapter.type).toBe(data.type);
            // Accessing other properties shouldn't throw
            if (data.fields.title) {
              expect(adapter.title).toBeDefined();
            }
            if (data.creators.author || data.fields.author) {
              expect(adapter.authorString).toBeDefined();
            }
            if (data.fields.year || data.fields.date) {
              expect(adapter.year).toBeDefined();
            }
          },
        ),
      );
    });
  });
});
