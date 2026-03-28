import {
  TemplateProfile,
  NoteKind,
  DEFAULT_PROFILE,
  DEFAULT_NOTE_KIND,
} from './template-profile';

/**
 * Resolves which template profile to use for a given (noteKind, entryType) pair.
 *
 * Resolution order:
 * 1. Exact match: noteKind + entryType in the profile's entryTypes list
 * 2. Wildcard match: noteKind + entryTypes contains '*'
 * 3. Default profile (always matches everything)
 */
export interface ITemplateProfileRegistry {
  register(profile: TemplateProfile): void;
  registerNoteKind(kind: NoteKind): void;

  /** Resolve the best matching profile for the given parameters. */
  resolve(noteKind: string, entryType: string): TemplateProfile;

  /** Get all registered profiles (for settings UI). */
  getProfiles(): TemplateProfile[];

  /** Get all registered note kinds (for settings UI). */
  getNoteKinds(): NoteKind[];

  /** Get the default profile. */
  getDefaultProfile(): TemplateProfile;
}

export class TemplateProfileRegistry implements ITemplateProfileRegistry {
  private profiles: TemplateProfile[] = [];
  private noteKinds: NoteKind[] = [];
  private defaultProfile: TemplateProfile;

  constructor(defaultProfile?: TemplateProfile) {
    this.defaultProfile = defaultProfile ?? DEFAULT_PROFILE;
    this.noteKinds.push(DEFAULT_NOTE_KIND);
  }

  register(profile: TemplateProfile): void {
    // Replace existing profile with same id
    const index = this.profiles.findIndex((p) => p.id === profile.id);
    if (index !== -1) {
      this.profiles[index] = profile;
    } else {
      this.profiles.push(profile);
    }
  }

  registerNoteKind(kind: NoteKind): void {
    if (!this.noteKinds.some((k) => k.id === kind.id)) {
      this.noteKinds.push(kind);
    }
  }

  resolve(noteKind: string, entryType: string): TemplateProfile {
    // 1. Exact match: noteKind matches AND entryType is in the list
    const exact = this.profiles.find(
      (p) => p.noteKind === noteKind && p.entryTypes.includes(entryType),
    );
    if (exact) return exact;

    // 2. Wildcard match: noteKind matches AND entryTypes contains '*'
    const wildcard = this.profiles.find(
      (p) => p.noteKind === noteKind && p.entryTypes.includes('*'),
    );
    if (wildcard) return wildcard;

    // 3. Default profile
    return this.defaultProfile;
  }

  getProfiles(): TemplateProfile[] {
    return [...this.profiles];
  }

  getNoteKinds(): NoteKind[] {
    return [...this.noteKinds];
  }

  getDefaultProfile(): TemplateProfile {
    return this.defaultProfile;
  }
}
