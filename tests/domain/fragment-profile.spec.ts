import {
  NEW_PROFILE_NAME,
  addProfile,
  createProfile,
  findProfile,
  freeProfileName,
  profileNameRejection,
  removeProfile,
  updateProfile,
  type FragmentProfile,
} from '../../src/domain/fragment-profile';

const PDF: FragmentProfile = { id: 'a', name: 'pdf-links', template: 'PDF' };
const DOI: FragmentProfile = { id: 'b', name: 'doi', template: '{{DOI}}' };

describe('fragment profiles', () => {
  it('creates a profile with a fresh id and a trimmed name', () => {
    const first = createProfile('  pdf  ', 'T');
    const second = createProfile('pdf');
    expect(first).toMatchObject({ name: 'pdf', template: 'T' });
    expect(second.template).toBe('');
    expect(first.id).not.toBe(second.id);
  });

  it('adds a named profile and ignores an unnamed one', () => {
    expect(addProfile([PDF], DOI)).toEqual([PDF, DOI]);
    expect(addProfile([PDF], { ...DOI, name: '' })).toEqual([PDF]);
  });

  it('updates the name and template of one profile only', () => {
    expect(updateProfile([PDF, DOI], 'a', ' links ', 'X')).toEqual([
      { id: 'a', name: 'links', template: 'X' },
      DOI,
    ]);
  });

  it('removes and finds profiles by id', () => {
    expect(removeProfile([PDF, DOI], 'a')).toEqual([DOI]);
    expect(findProfile([PDF, DOI], 'b')).toBe(DOI);
    expect(findProfile([PDF], 'missing')).toBeUndefined();
  });

  it('picks the first free name', () => {
    expect(freeProfileName([], NEW_PROFILE_NAME)).toBe('New profile');
    expect(
      freeProfileName(
        [
          { ...PDF, name: 'New profile' },
          { ...DOI, name: 'New profile 2' },
        ],
        NEW_PROFILE_NAME,
      ),
    ).toBe('New profile 3');
  });

  it('rejects an empty name and a name another profile uses', () => {
    expect(profileNameRejection([PDF], '', '  ')).toBe(
      'Give the profile a name.',
    );
    expect(profileNameRejection([PDF, DOI], 'b', ' pdf-links ')).toBe(
      'Another profile already uses this name.',
    );
  });

  it('accepts a free name and a profile keeping its own name', () => {
    expect(profileNameRejection([PDF], '', 'doi')).toBeUndefined();
    expect(profileNameRejection([PDF], 'a', 'pdf-links')).toBeUndefined();
  });
});
