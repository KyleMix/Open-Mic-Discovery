import { destinationPath, scenarios, shiftLabel, shiftOffsets } from './scenarios';

describe('test kit catalog', () => {
  it('has a unique key per test', () => {
    const keys = scenarios.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says what each test does and what to try, with no em dashes', () => {
    for (const scenario of scenarios) {
      expect(scenario.label.length).toBeGreaterThan(0);
      expect(scenario.detail.length).toBeGreaterThan(0);
      expect(scenario.tryThis.length).toBeGreaterThan(0);
      expect(`${scenario.label} ${scenario.detail} ${scenario.tryThis}`).not.toMatch(/[—–]/);
    }
  });

  it('gives every test somewhere to land, so none of them dead ends here', () => {
    for (const scenario of scenarios) {
      const path = destinationPath(scenario.destination, {
        seriesId: 'series-1',
        occurrenceId: 'occ-1',
      });
      expect(path).toBeTruthy();
    }
  });
});

describe('destinationPath', () => {
  it('routes each kind of lane to the screen the test happens on', () => {
    const ids = { seriesId: 'series-1', occurrenceId: 'occ-1' };
    expect(destinationPath({ screen: 'live' }, ids)).toBe('/producer/live/occ-1');
    expect(destinationPath({ screen: 'roster' }, ids)).toBe('/producer/night/occ-1');
    expect(destinationPath({ screen: 'mic' }, ids)).toBe('/mic/series-1');
    expect(destinationPath({ screen: 'discover' }, ids)).toBe('/(tabs)');
    expect(destinationPath({ screen: 'moderation' }, ids)).toBe('/admin');
    expect(destinationPath({ screen: 'going' }, ids)).toBe('/(tabs)/going');
  });

  it('refuses to navigate when the scenario did not build what the screen needs', () => {
    // Pushing a night screen with no night is a blank screen and a confused
    // tester, which is worse than saying nothing happened.
    expect(destinationPath({ screen: 'live' }, {})).toBeNull();
    expect(destinationPath({ screen: 'roster' }, { seriesId: 'series-1' })).toBeNull();
    expect(destinationPath({ screen: 'mic' }, { occurrenceId: 'occ-1' })).toBeNull();
  });

  it('routes the browse lanes without needing any ids', () => {
    expect(destinationPath({ screen: 'discover' }, {})).toBe('/(tabs)');
    expect(destinationPath({ screen: 'moderation' }, {})).toBe('/admin');
  });
});

describe('the time machine offsets', () => {
  it('offers them shortest first', () => {
    expect([...shiftOffsets]).toEqual([...shiftOffsets].sort((a, b) => a - b));
    expect(shiftOffsets[0]).toBeGreaterThan(0);
  });

  it('labels offsets in minutes and hours', () => {
    expect(shiftLabel(5)).toBe('5 min');
    expect(shiftLabel(59)).toBe('59 min');
    expect(shiftLabel(60)).toBe('1 hour');
    expect(shiftLabel(180)).toBe('3 hours');
  });
});
