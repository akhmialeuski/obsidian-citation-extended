import { AbstractInputSuggest, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { FragmentProfile } from '../../domain/fragment-profile';

/**
 * Native Obsidian popover under the "Profile" field of the "Replace selection
 * with template" dialog. Lists the fragment profiles whose name contains the
 * typed text, each with a rename button, and ends with an item that creates a
 * profile under the typed name. Modelled on `TextInputSuggest` of the
 * Advanced Audio Recorder plugin: candidates are read per query, so a profile
 * saved while the dialog is open shows up on the next keystroke.
 */

/** One row of the popover. */
export type ProfileSuggestion =
  | { kind: 'profile'; profile: FragmentProfile }
  | { kind: 'create'; name: string };

/** What the dialog does when a row (or a row's rename button) is chosen. */
export interface ProfileSuggestHandlers {
  pick(profile: FragmentProfile): void;
  create(name: string): void;
  rename(profile: FragmentProfile): void;
}

export class ProfileSuggest extends AbstractInputSuggest<ProfileSuggestion> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly candidates: () => readonly FragmentProfile[],
    private readonly handlers: ProfileSuggestHandlers,
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): ProfileSuggestion[] {
    const wanted = query.trim();
    const lower = wanted.toLowerCase();
    const profiles = this.candidates();
    const rows: ProfileSuggestion[] = profiles
      .filter((profile) => profile.name.toLowerCase().includes(lower))
      .map((profile) => ({ kind: 'profile', profile }));
    if (wanted !== '' && !profiles.some((profile) => profile.name === wanted)) {
      rows.push({ kind: 'create', name: wanted });
    }
    return rows;
  }

  renderSuggestion(row: ProfileSuggestion, el: HTMLElement): void {
    if (row.kind === 'create') {
      el.addClass('citation-fragment-create');
      setIcon(el.createSpan(), 'plus');
      el.createSpan({ text: `Create profile "${row.name}"` });
      return;
    }
    el.addClass('citation-fragment-suggestion');
    el.createSpan({ text: row.profile.name });
    const rename = el.createSpan({
      cls: 'clickable-icon',
      attr: { 'aria-label': 'Rename profile' },
    });
    setIcon(rename, 'pencil');
    // The popover selects a row on mousedown; the rename button must not
    // also pick the profile, so it stops the event before the row sees it.
    rename.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.handlers.rename(row.profile);
    });
  }

  override selectSuggestion(row: ProfileSuggestion): void {
    if (row.kind === 'create') this.handlers.create(row.name);
    else this.handlers.pick(row.profile);
    this.close();
  }
}
