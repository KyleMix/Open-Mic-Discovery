import { consumeReturnTo, setReturnTo, useReturnToStore } from './return-to';

describe('return-to store', () => {
  beforeEach(() => {
    useReturnToStore.setState({ path: null });
  });

  it('hands the recorded path back exactly once', () => {
    setReturnTo('/mic/abc');
    expect(consumeReturnTo()).toBe('/mic/abc');
    expect(consumeReturnTo()).toBeNull();
  });

  it('refuses auth screens and non-paths', () => {
    setReturnTo('/(auth)/sign-in');
    expect(consumeReturnTo()).toBeNull();
    // usePathname strips route groups, so this is the shape real callers
    // would actually pass.
    setReturnTo('/sign-in');
    expect(consumeReturnTo()).toBeNull();
    setReturnTo('/reset-password');
    expect(consumeReturnTo()).toBeNull();
    setReturnTo('https://elsewhere.example');
    expect(consumeReturnTo()).toBeNull();
  });

  it('keeps real destinations that merely share a prefix', () => {
    setReturnTo('/mic/sign-in-lounge');
    expect(consumeReturnTo()).toBe('/mic/sign-in-lounge');
  });

  it('keeps the latest destination when set twice', () => {
    setReturnTo('/mic/first');
    setReturnTo('/mic/second');
    expect(consumeReturnTo()).toBe('/mic/second');
  });
});
