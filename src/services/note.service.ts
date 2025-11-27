import { App, TFile, normalizePath } from 'obsidian';
import * as path from 'path';
import { CitationsPluginSettings } from '../settings';
import { TemplateService } from './template.service';
import { Library } from '../types';
import { DISALLOWED_FILENAME_CHARACTERS_RE, Notifier } from '../util';

export class NoteService {
    literatureNoteErrorNotifier = new Notifier(
        'Unable to access literature note. Please check that the literature note folder exists, or update the Citations plugin settings.',
    );

    constructor(
        private app: App,
        private settings: CitationsPluginSettings,
        private templateService: TemplateService
    ) { }

    getPathForCitekey(citekey: string, library: Library): string {
        const entry = library.entries[citekey];
        const variables = this.templateService.getTemplateVariables(entry);
        const unsafeTitle = this.templateService.getTitle(variables);
        const title = unsafeTitle.replace(DISALLOWED_FILENAME_CHARACTERS_RE, '_');
        return path.join(this.settings.literatureNoteFolder, `${title}.md`);
    }

    async getOrCreateLiteratureNoteFile(citekey: string, library: Library): Promise<TFile> {
        const path = this.getPathForCitekey(citekey, library);
        const normalizedPath = normalizePath(path);

        let file = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (file == null) {
            // First try a case-insensitive lookup.
            const matches = this.app.vault
                .getMarkdownFiles()
                .filter((f) => f.path.toLowerCase() == normalizedPath.toLowerCase());
            if (matches.length > 0) {
                file = matches[0];
            } else {
                try {
                    const entry = library.entries[citekey];
                    const variables = this.templateService.getTemplateVariables(entry);
                    const content = this.templateService.getContent(variables);
                    file = await this.app.vault.create(path, content);
                } catch (exc) {
                    this.literatureNoteErrorNotifier.show();
                    throw exc;
                }
            }
        }

        return file as TFile;
    }

    async openLiteratureNote(citekey: string, library: Library, newPane: boolean): Promise<void> {
        this.getOrCreateLiteratureNoteFile(citekey, library)
            .then((file: TFile) => {
                this.app.workspace.getLeaf(newPane).openFile(file);
            })
            .catch(console.error);
    }
}
