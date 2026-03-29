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
  databaseId?: string,
): SourceLoadResult {
  return {
    sourceId: `source-${databaseName}`,
    databaseId: databaseId ?? `id-${databaseName}`,
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

    const pipeline = new NormalizationPipeline().addStep(step1).addStep(step2);

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
    expect(
      (library.entries['key1'] as unknown as Record<string, unknown>).title,
    ).toBe('Second');
  });

  it('calls prepare on steps that have it', () => {
    const step = new DeduplicationStep();
    const prepareSpy = jest.spyOn(step, 'prepare');
    const pipeline = new NormalizationPipeline().addStep(step);

    const results = [makeResult('db1', [makeEntry('key1')])];
    pipeline.run(results);

    expect(prepareSpy).toHaveBeenCalledWith(results);
  });

  it('passes databaseId in SourceMetadata', () => {
    const processedMetadata: Array<{
      databaseId: string;
      databaseName: string;
    }> = [];
    const step = {
      name: 'capture-metadata',
      process: jest.fn((entries, metadata) => {
        processedMetadata.push({
          databaseId: metadata.databaseId,
          databaseName: metadata.databaseName,
        });
        return entries;
      }),
    };

    const pipeline = new NormalizationPipeline().addStep(step);
    pipeline.run([makeResult('Zotero', [makeEntry('key1')], 'db-123-abc')]);

    expect(processedMetadata).toHaveLength(1);
    expect(processedMetadata[0].databaseId).toBe('db-123-abc');
    expect(processedMetadata[0].databaseName).toBe('Zotero');
  });
});

describe('SourceTaggingStep', () => {
  it('tags entries with source database name (not id)', () => {
    const step = new SourceTaggingStep();
    const entries = [makeEntry('key1')];

    const result = step.process(entries as never[], {
      sourceId: 's1',
      databaseId: 'db-123-abc',
      databaseName: 'Zotero',
    });

    expect(result[0]._sourceDatabase).toBe('Zotero');
  });

  it('uses databaseName, not databaseId, for _sourceDatabase', () => {
    const step = new SourceTaggingStep();
    const entries = [makeEntry('key1')];

    const result = step.process(entries as never[], {
      sourceId: 's1',
      databaseId: 'db-stable-id',
      databaseName: 'My Library',
    });

    expect(result[0]._sourceDatabase).toBe('My Library');
  });
});

describe('DeduplicationStep', () => {
  it('creates composite citekeys using databaseId', () => {
    const step = new DeduplicationStep();
    const results = [
      makeResult(
        'Zotero',
        [makeEntry('key1', { _sourceDatabase: 'Zotero' })],
        'db-zotero-1',
      ),
      makeResult(
        'Mendeley',
        [makeEntry('key1', { _sourceDatabase: 'Mendeley' })],
        'db-mendeley-2',
      ),
    ];

    step.prepare(results);

    const r1 = step.process(results[0].entries as never[], {
      sourceId: 's1',
      databaseId: 'db-zotero-1',
      databaseName: 'Zotero',
    });
    const r2 = step.process(results[1].entries as never[], {
      sourceId: 's2',
      databaseId: 'db-mendeley-2',
      databaseName: 'Mendeley',
    });

    expect(r1[0].id).toBe('key1@db-zotero-1');
    expect(r2[0].id).toBe('key1@db-mendeley-2');
    expect(r1[0]._compositeCitekey).toBe('key1@db-zotero-1');
  });

  it('renaming databaseName does not change composite key', () => {
    const step = new DeduplicationStep();
    const stableId = 'db-stable-123';
    const results = [
      makeResult('Old Name', [makeEntry('key1')], stableId),
      makeResult('Other DB', [makeEntry('key1')], 'db-other-456'),
    ];

    step.prepare(results);

    const r1 = step.process(results[0].entries as never[], {
      sourceId: 's1',
      databaseId: stableId,
      databaseName: 'Old Name',
    });

    // Now simulate renamed database — same databaseId, different databaseName
    const r1Renamed = step.process(results[0].entries as never[], {
      sourceId: 's1',
      databaseId: stableId,
      databaseName: 'New Name',
    });

    // Composite key should be the same regardless of databaseName
    expect(r1[0].id).toBe(`key1@${stableId}`);
    expect(r1Renamed[0].id).toBe(`key1@${stableId}`);
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
      databaseId: 'db-1',
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
      databaseId: 'db-1',
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
      makeResult('Zotero', [makeEntry('key1'), makeEntry('key2')], 'db-zotero'),
      makeResult(
        'Mendeley',
        [makeEntry('key1'), makeEntry('key3')],
        'db-mendeley',
      ),
    ];

    const library = pipeline.run(results);

    expect(library.size).toBe(4); // key1@db-zotero, key1@db-mendeley, key2, key3
    expect(library.entries['key1@db-zotero']).toBeDefined();
    expect(library.entries['key1@db-mendeley']).toBeDefined();
    expect(library.entries['key2']).toBeDefined();
    expect(library.entries['key3']).toBeDefined();
  });
});
