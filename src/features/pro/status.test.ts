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
});
