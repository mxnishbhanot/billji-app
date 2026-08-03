import { DEFAULT_SYNC_PREFERENCES, parseSyncPreferences } from '../syncPreferences';

describe('parseSyncPreferences', () => {
  it('falls back to the defaults when nothing is stored', () => {
    expect(parseSyncPreferences(null)).toEqual(DEFAULT_SYNC_PREFERENCES);
  });

  it('never lets corrupt storage disable syncing', () => {
    expect(parseSyncPreferences('{not json')).toEqual(DEFAULT_SYNC_PREFERENCES);
    expect(parseSyncPreferences('"a string"')).toEqual(DEFAULT_SYNC_PREFERENCES);
    expect(parseSyncPreferences('null')).toEqual(DEFAULT_SYNC_PREFERENCES);
  });

  it('keeps stored booleans and defaults the rest', () => {
    expect(parseSyncPreferences('{"wifiOnly":true}')).toEqual({ ...DEFAULT_SYNC_PREFERENCES, wifiOnly: true });
    expect(parseSyncPreferences('{"auto":false,"background":false,"wifiOnly":true}')).toEqual({
      auto: false,
      background: false,
      wifiOnly: true
    });
  });

  it('ignores values of the wrong type', () => {
    expect(parseSyncPreferences('{"auto":"yes","wifiOnly":1}')).toEqual(DEFAULT_SYNC_PREFERENCES);
  });
});
