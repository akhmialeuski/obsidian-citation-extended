import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';

jest.mock(
  'obsidian',
  () => ({
    App: class {},
    Plugin: class {},
    PluginSettingTab: class {},
    Setting: class {},
  }),
  { virtual: true },
);

import { TemplateService } from '../template.service';
import { CitationsPluginSettings } from '../../settings';
import {
  EntryDataBibLaTeX,
  EntryDataCSL,
  EntryBibLaTeXAdapter,
  EntryCSLAdapter,
  loadEntries,
  TemplateContext,
} from '../../types';

const expectedRender: Record<string, string | undefined>[] = [
  {
    citekey: 'Weiner2003',
    abstract:
      'Biomineralization links soft organic tissues, which are compositionally akin to the atmosphere and oceans, with the hard materials of the solid Earth. It provides organisms with skeletons and shells while they are alive, and when they die these are deposited as sediment in environments from river plains to the deep ocean floor. It is also these hard, resistant products of life which are mainly responsible for the Earths fossil record. Consequently, biomineralization involves biologists, chemists, and geologists in interdisciplinary studies at one of the interfaces between Earth and life.',
    authorString: 'S. Weiner',
    containerTitle: 'Rev. Mineral. Geochemistry',
    DOI: '10.2113/0540001',
    eprint: '1105.3402',
    note: 'This is a test note with some <b>formatting</b>.',
    page: '1-29',
    title:
      'An Overview of Biomineralization Processes and the Problem of the Vital Effect',
    URL: 'http://rimg.geoscienceworld.org/cgi/doi/10.2113/0540001',
    year: '2003',
    zoteroSelectURI: 'zotero://select/items/@Weiner2003',
  },
  {
    citekey: 'abnar2019blackbox',
    abstract:
      'In this paper, we define and apply representational stability analysis (ReStA), an intuitive way of analyzing neural language models. ReStA is a variant of the popular representational similarity analysis (RSA) in cognitive neuroscience. While RSA can be used to compare representations in models, model components, and human brains, ReStA compares instances of the same model, while systematically varying single model parameter. Using ReStA, we study four recent and successful neural language models, and evaluate how sensitive their internal representations are to the amount of prior context. Using RSA, we perform a systematic study of how similar the representational spaces in the first and second (or higher) layers of these models are to each other and to patterns of activation in the human brain. Our results reveal surprisingly strong differences between language models, and give insights into where the deep linguistic processing, that integrates information over multiple sentences, is happening in these models. The combination of ReStA and RSA on models and brains allows us to start addressing the important question of what kind of linguistic processes we can hope to observe in fMRI brain imaging data. In particular, our results suggest that the data on story reading from Wehbe et al. (2014) contains a signal of shallow linguistic processing, but show no evidence on the more interesting deep linguistic processing.',
    authorString:
      'Samira Abnar, Lisa Beinborn, Rochelle Choenni, Willem Zuidema',
    containerTitle: 'arxiv:1906.01539 [cs, q-bio]',
    DOI: undefined,
    eprint: '1906.01539',
    eprinttype: 'arxiv',
    page: undefined,
    title:
      'Blackbox meets blackbox: Representational Similarity and Stability Analysis of Neural Language Models and Brains',
    titleShort: 'Blackbox meets blackbox',
    URL: 'http://arxiv.org/abs/1906.01539',
    year: '2019',
    zoteroSelectURI: 'zotero://select/items/@abnar2019blackbox',
  },
  {
    citekey: 'aitchison2017you',
    abstract:
      'Two theoretical ideas have emerged recently with the ambition to provide a unifying functional explanation of neural population coding and dynamics: predictive coding and Bayesian inference. Here, we describe the two theories and their combination into a single framework: Bayesian predictive coding. We clarify how the two theories can be distinguished, despite sharing core computational concepts and addressing an overlapping set of empirical phenomena. We argue that predictive coding is an algorithmic/representational motif that can serve several different computational goals of which Bayesian inference is but one. Conversely, while Bayesian inference can utilize predictive coding, it can also be realized by a variety of other representations. We critically evaluate the experimental evidence supporting Bayesian predictive coding and discuss how to test it more directly.',
    authorString: 'Laurence Aitchison, Máté Lengyel',
    containerTitle: 'Current Opinion in Neurobiology',
    DOI: '10.1016/j.conb.2017.08.010',
    page: '219–227',
    title:
      'With or without you: Predictive coding and Bayesian inference in the brain',
    URL: 'http://www.sciencedirect.com/science/article/pii/S0959438817300454',
    year: '2017',
    zoteroSelectURI: 'zotero://select/items/@aitchison2017you',
  },
  {
    citekey: 'alexandrescu2006factored',
    abstract: undefined,
    authorString: 'Andrei Alexandrescu, Katrin Kirchhoff',
    containerTitle: undefined,
    DOI: undefined,
    page: '1–4',
    title: 'Factored Neural Language Models',
    URL: 'http://aclasb.dfki.de/nlp/bib/N06-2001',
    year: '2006',
    zoteroSelectURI: 'zotero://select/items/@alexandrescu2006factored',
    publisher: 'Association for Computational Linguistics',
  },
  {
    citekey: 'bar-ashersiegal2020perspectives',
    abstract: undefined,
    authorString: undefined,
    containerTitle: undefined,
    DOI: '10.1007/978-3-030-34308-8',
    page: undefined,
    title:
      'Perspectives on Causation: Selected Papers from the Jerusalem 2017 Workshop',
    URL: 'http://link.springer.com/10.1007/978-3-030-34308-8',
    year: '2020',
    zoteroSelectURI: 'zotero://select/items/@bar-ashersiegal2020perspectives',
    publisher: 'Springer International Publishing',
    publisherPlace: 'Cham',
  },
];

const BIBLATEX_FIELDS_ONLY = ['eprint', 'eprinttype', 'files', 'note'];

function matchLibraryRender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actual: Record<string, any>[],
  expected: Record<string, string | undefined>[],
  dropFields?: string[],
): void {
  const transform = (
    dict: Record<string, string | undefined>,
  ): Record<string, string> => {
    delete dict.entry;

    if (dropFields) {
      dropFields.forEach((f) => delete dict[f]);
    }

    return _.mapValues(dict, (val: unknown) =>
      val
        ?.toString()
        .toLowerCase()
        .replace(/[\u2012-\u2014]/g, '-'),
    ) as Record<string, string>;
  };

  actual = actual.map((a) => transform(a));
  expected = expected.map((e) => transform(e as Record<string, string>));

  expect(actual).toMatchObject(expected);
}

function loadBibLaTeXEntries(filename: string): EntryDataBibLaTeX[] {
  const biblatexPath = path.join(__dirname, '../../__tests__', filename);
  const biblatex = fs.readFileSync(biblatexPath, 'utf-8');
  return loadEntries(biblatex, 'biblatex') as EntryDataBibLaTeX[];
}

describe('TemplateService', () => {
  let service: TemplateService;
  let settings: CitationsPluginSettings;

  beforeEach(() => {
    settings = new CitationsPluginSettings();
    service = new TemplateService(settings);
  });

  describe('BibLaTeX variable generation', () => {
    let entries: EntryDataBibLaTeX[];
    beforeEach(() => {
      entries = loadBibLaTeXEntries('library.bib');
    });

    test('renders correctly', () => {
      const templateVariables: TemplateContext[] = entries.map((e) => {
        const entry = new EntryBibLaTeXAdapter(e);
        return service.getTemplateVariables(entry);
      });

      matchLibraryRender(templateVariables, expectedRender);
    });
  });

  describe('CSL variable generation', () => {
    let entries: EntryDataCSL[];
    beforeEach(() => {
      const cslPath = path.join(__dirname, '../../__tests__', 'library.json');
      const csl = fs.readFileSync(cslPath, 'utf-8');
      entries = loadEntries(csl, 'csl-json') as EntryDataCSL[];
    });

    test('renders correctly', () => {
      const templateVariables: TemplateContext[] = entries.map((e) => {
        const entry = new EntryCSLAdapter(e);
        return service.getTemplateVariables(entry);
      });

      matchLibraryRender(
        templateVariables,
        expectedRender,
        BIBLATEX_FIELDS_ONLY,
      );
    });
  });

  describe('Template rendering', () => {
    test('renderTitle', () => {
      settings.literatureNoteTitleTemplate = 'Title: {{title}}';
      settings.literatureNoteTitleTemplate = 'Title: {{title}}';
      const variables = ({ title: 'My Title' } as unknown) as TemplateContext;
      expect(service.getTitle(variables)).toBe('Title: My Title');
    });

    test('renderContent', () => {
      settings.literatureNoteContentTemplate = 'Content: {{year}}';
      settings.literatureNoteContentTemplate = 'Content: {{year}}';
      const variables = ({ year: '2023' } as unknown) as TemplateContext;
      expect(service.getContent(variables)).toBe('Content: 2023');
    });
  });
});
