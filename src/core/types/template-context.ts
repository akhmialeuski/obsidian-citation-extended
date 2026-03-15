export interface TemplateContext {
  citekey: string;
  abstract?: string;
  authorString?: string | null;
  containerTitle?: string;
  DOI?: string;
  eprint?: string | null;
  eprinttype?: string | null;
  eventPlace?: string;
  keywords?: string[];
  language?: string;
  note?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  series?: string;
  volume?: string;
  source?: string;
  title?: string;
  titleShort?: string;
  type: string;
  URL?: string;
  year?: string;
  zoteroSelectURI: string;
  zoteroId?: string;
  date?: string | null;

  entry: Record<string, unknown>;
}
