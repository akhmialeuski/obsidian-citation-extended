import {
  NormalizationPipeline,
  SourceTaggingStep,
  DeduplicationStep,
  SourceLoadResult,
} from '../../src/infrastructure/normalization-pipeline';

jest.mock('obsidian', () => ({}), { virtual: true });

function makeEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    _sourceDatabase: undefined,
    _compositeCitekey: undefined,
    ...overrides,
  };
}

function makeResult(
  databaseName: string,
  entries: ReturnType<typeof makeEntry>[],
): SourceLoadResult {
  return {
    sourceId: `source-${databaseName}`,
    databaseName,
    entries: entries as never[],
    parseErrors: [],
  };
}

describe('NormalizationPipeline', () => {
  it('runs without steps and builds a Library', () => {
    const pipeline = new NormalizationPipeline();
    const results = [makeResult('db1', [makeEntry('key1')])];

    const library = pipeline.run(results);

    expect(library.size).toBe(1);
    expect(library.entries['key1']).toBeDefined();
  });

  it('runs steps in order', () => {
    const order: string[] = [];
    const step1 = {
      name: 'step1',
      process: jest.fn((entries) => {
        order.push('step1');
        return entries;
      }),
    };
    const step2 = {
      name: 'step2',
      process: jest.fn((entries) => {
        order.push('step2');
        return entries;
      }),
    };

    const pipeline = new NormalizationPipeline()
      .addStep(step1)
      .addStep(step2);

    pipeline.run([makeResult('db1', [makeEntry('key1')])]);

    expect(order).toEqual(['step1', 'step2']);
  });

  it('merges entries from multiple sources', () => {
    const pipeline = new NormalizationPipeline();
    const results = [
      makeResult('db1', [makeEntry('key1')]),
      makeResult('db2', [makeEntry('key2')]),
    ];

    const library = pipeline.run(results);

    expect(library.size).toBe(2);
  });

  it('last source wins for duplicate keys without dedup step', () => {
    const pipeline = new NormalizationPipeline();
    const results = [
      makeResult('db1', [makeEntry('key1', { title: 'First' })]),
      makeResult('db2', [makeEntry('key1', { title: 'Second' })]),
    ];

    const library = pipeline.run(results);

    expect(library.size).toBe(1);
    expect((library.entries['key1'] as unknown as Record<string, unknown>).title).toBe('Second');
  });

  it('calls prepare on steps that have it', () => {
    const step = new DeduplicationStep();
    const prepareSpy = jest.spyOn(step, 'prepare');
    const pipeline = new NormalizationPipeline().addStep(step);

    const results = [makeResult('db1', [makeEntry('key1')])];
    pipeline.run(results);

    expect(prepareSpy).toHaveBeenCalledWith(results);
  });
});

describe('SourceTaggingStep', () => {
  it('tags entries with source database name', () => {
    const step = new SourceTaggingStep();
    const entries = [makeEntry('key1')];

    const result = step.process(
      entries as never[],
      { sourceId: 's1', databaseName: 'Zotero' },
    );

    expect(result[0]._sourceDatabase).toBe('Zotero');
  });
});

describe('DeduplicationStep', () => {
  it('creates composite citekeys for duplicates', () => {
    const step = new DeduplicationStep();
    const results = [
      makeResult('Zotero', [makeEntry('key1', { _sourceDatabase: 'Zotero' })]),
      makeResult('Mendeley', [makeEntry('key1', { _sourceDatabase: 'Mendeley' })]),
    ];

    step.prepare(results);

    const r1 = step.process(results[0].entries as never[], {
      sourceId: 's1',
      databaseName: 'Zotero',
    });
    const r2 = step.process(results[1].entries as never[], {
      sourceId: 's2',
      databaseName: 'Mendeley',
    });

    expect(r1[0].id).toBe('key1@Zotero');
    expect(r2[0].id).toBe('key1@Mendeley');
    expect(r1[0]._compositeCitekey).toBe('key1@Zotero');
  });

  it('does not modify unique citekeys', () => {
    const step = new DeduplicationStep();
    const results = [
      makeResult('Zotero', [makeEntry('key1')]),
      makeResult('Mendeley', [makeEntry('key2')]),
    ];

    step.prepare(results);

    const r1 = step.process(results[0].entries as never[], {
      sourceId: 's1',
      databaseName: 'Zotero',
    });

    expect(r1[0].id).toBe('key1');
    expect(r1[0]._compositeCitekey).toBeUndefined();
  });

  it('is a no-op when not prepared', () => {
    const step = new DeduplicationStep();
    const entries = [makeEntry('key1')];

    const result = step.process(entries as never[], {
      sourceId: 's1',
      databaseName: 'db1',
    });

    expect(result[0].id).toBe('key1');
  });
});

describe('Full pipeline: SourceTagging + Deduplication', () => {
  it('tags and deduplicates in a single pass', () => {
    const pipeline = new NormalizationPipeline()
      .addStep(new SourceTaggingStep())
      .addStep(new DeduplicationStep());

    const results = [
      makeResult('Zotero', [makeEntry('key1'), makeEntry('key2')]),
      makeResult('Mendeley', [makeEntry('key1'), makeEntry('key3')]),
    ];

    const library = pipeline.run(results);

    expect(library.size).toBe(4); // key1@Zotero, key1@Mendeley, key2, key3
    expect(library.entries['key1@Zotero']).toBeDefined();
    expect(library.entries['key1@Mendeley']).toBeDefined();
    expect(library.entries['key2']).toBeDefined();
    expect(library.entries['key3']).toBeDefined();
  });
});
