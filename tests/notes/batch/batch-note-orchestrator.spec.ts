import {
  BatchNoteOrchestrator,
  type BatchUpdateRequest,
  type IBatchNoteOrchestrator,
} from '../../../src/notes/batch';

describe('BatchNoteOrchestrator', () => {
  let orchestrator: IBatchNoteOrchestrator;

  beforeEach(() => {
    orchestrator = new BatchNoteOrchestrator();
  });

  it('implements IBatchNoteOrchestrator interface', () => {
    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.preview).toBe('function');
    expect(typeof orchestrator.execute).toBe('function');
  });

  it('preview() throws not-implemented error', async () => {
    const request: BatchUpdateRequest = {
      citekeys: ['key1'],
      templateStr: '{{title}}',
      dryRun: true,
    };

    await expect(orchestrator.preview(request)).rejects.toThrow(
      'not yet implemented',
    );
  });

  it('execute() throws not-implemented error', async () => {
    const request: BatchUpdateRequest = {
      citekeys: ['*'],
      templateStr: '{{title}}',
      dryRun: false,
    };

    await expect(orchestrator.execute(request)).rejects.toThrow(
      'not yet implemented',
    );
  });

  it('execute() accepts optional progress callback', async () => {
    const request: BatchUpdateRequest = {
      citekeys: ['key1'],
      templateStr: '{{title}}',
      dryRun: false,
    };
    const onProgress = jest.fn();

    await expect(orchestrator.execute(request, onProgress)).rejects.toThrow(
      'not yet implemented',
    );
  });
});

describe('BatchUpdateRequest type contract', () => {
  it('accepts wildcard citekeys', () => {
    const request: BatchUpdateRequest = {
      citekeys: ['*'],
      templateStr: '# {{title}}',
      dryRun: true,
    };
    expect(request.citekeys).toEqual(['*']);
    expect(request.dryRun).toBe(true);
  });

  it('accepts specific citekeys', () => {
    const request: BatchUpdateRequest = {
      citekeys: ['smith2020', 'jones2021'],
      templateStr: '---\ntitle: {{title}}\n---',
      dryRun: false,
    };
    expect(request.citekeys).toHaveLength(2);
  });
});
