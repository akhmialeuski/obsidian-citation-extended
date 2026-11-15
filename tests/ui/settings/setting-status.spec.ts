/** @jest-environment jsdom */

import {
  SETTING_STATUS_KINDS,
  setSettingStatus,
} from '../../../src/ui/settings/setting-status';

describe('setSettingStatus', () => {
  // A status line that kept its previous class would be coloured by whichever rule the stylesheet lists last.
  it('replaces the previous state instead of adding a second one', () => {
    const el = document.createElement('div');
    el.className = 'citation-setting-status';

    setSettingStatus(el, SETTING_STATUS_KINDS.Muted);
    setSettingStatus(el, SETTING_STATUS_KINDS.Error);

    expect([...el.classList]).toEqual(['citation-setting-status', 'is-error']);
  });
});
