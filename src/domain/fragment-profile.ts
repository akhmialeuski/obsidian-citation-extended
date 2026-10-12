/**
 * Fragment profiles: named Handlebars templates the "Insert or replace with
 * template output" dialog can load. A profile only fills the dialog; it is never
 * linked to the notes it was applied to. The helpers are pure and return new
 * lists, ported from the profile model of the Advanced Audio Recorder plugin.
 */

/** A named template stored in the plugin settings. */
export interface FragmentProfile {
  id: string;
  name: string;
  template: string;
}

/** Name given to a profile added from the settings before the user renames it. */
export const NEW_PROFILE_NAME = 'New profile';

/** `base` if no profile uses it, otherwise the first free "base 2", "base 3", ... */
export function freeProfileName(
  profiles: readonly FragmentProfile[],
  base: string,
): string {
  const taken = new Set(profiles.map((profile) => profile.name));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

/** Build a profile with a fresh id and a trimmed name. */
export function createProfile(name: string, template = ''): FragmentProfile {
  return { id: crypto.randomUUID(), name: name.trim(), template };
}

/** Append a profile. A profile without a name is not added. */
export function addProfile(
  profiles: readonly FragmentProfile[],
  profile: FragmentProfile,
): FragmentProfile[] {
  return profile.name === '' ? [...profiles] : [...profiles, profile];
}

/** Replace the name and template of the profile with the given id. */
export function updateProfile(
  profiles: readonly FragmentProfile[],
  id: string,
  name: string,
  template: string,
): FragmentProfile[] {
  return profiles.map((profile) =>
    profile.id === id ? { ...profile, name: name.trim(), template } : profile,
  );
}

/** Remove the profile with the given id. */
export function removeProfile(
  profiles: readonly FragmentProfile[],
  id: string,
): FragmentProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}

/** Find a profile by id. */
export function findProfile(
  profiles: readonly FragmentProfile[],
  id: string,
): FragmentProfile | undefined {
  return profiles.find((profile) => profile.id === id);
}

/**
 * Why `name` cannot be used for the profile with `id`, or undefined when it
 * can. Pass an empty `id` for a profile that does not exist yet.
 */
export function profileNameRejection(
  profiles: readonly FragmentProfile[],
  id: string,
  name: string,
): string | undefined {
  const wanted = name.trim();
  if (wanted === '') {
    return 'Give the profile a name.';
  }
  return profiles.some(
    (profile) => profile.id !== id && profile.name === wanted,
  )
    ? 'Another profile already uses this name.'
    : undefined;
}
