import { scenarios, shiftLabel, shiftOffsets } from './scenarios';

describe('test kit scenario catalog', () => {
  it('has a unique key per scenario', () => {
    const keys = scenarios.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('describes every scenario in plain language, with no em dashes', () => {
    for (const scenario of scenarios) {
      expect(scenario.label.length).toBeGreaterThan(0);
      expect(scenario.detail.length).toBeGreaterThan(0);
      expect(scenario.checks.length).toBeGreaterThan(0);
      expect(`${scenario.label} ${scenario.detail} ${scenario.checks}`).not.toMatch(/[—–]/);
    }
  });

  it('offers time machine offsets shortest first', () => {
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
