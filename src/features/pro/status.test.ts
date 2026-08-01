import { resolveProStatus } from './status';

describe('resolveProStatus', () => {
  it('follows RevenueCat when configured', () => {
    expect(resolveProStatus(true, false, true)).toEqual({ status: 'entitled', entitled: true });
    expect(resolveProStatus(true, false, false)).toEqual({
      status: 'not_entitled',
      entitled: false,
    });
    expect(resolveProStatus(true, true, false).entitled).toBe(false);
  });

  it('unconfigured: open in dev builds, closed in production', () => {
    expect(resolveProStatus(false, true, false)).toEqual({
      status: 'unconfigured',
      entitled: true,
    });
    expect(resolveProStatus(false, false, false)).toEqual({
      status: 'unconfigured',
      entitled: false,
    });
  });

  it('a test kit override wins over every other input, in both directions', () => {
    expect(resolveProStatus(true, false, false, 'entitled')).toEqual({
      status: 'entitled',
      entitled: true,
    });
    expect(resolveProStatus(true, false, true, 'locked')).toEqual({
      status: 'not_entitled',
      entitled: false,
    });
    expect(resolveProStatus(false, true, false, 'locked').entitled).toBe(false);
  });

  it('defaults to no override, so normal resolution is unchanged', () => {
    expect(resolveProStatus(true, false, true, 'off')).toEqual(resolveProStatus(true, false, true));
  });
});
