import { ordinal, slotLabel, statusWithSlot } from './labels';

describe('signup label helpers', () => {
  it('writes slots one way everywhere', () => {
    expect(slotLabel(4)).toBe('Slot 4');
    expect(statusWithSlot('confirmed', 4)).toBe('On the list · Slot 4');
    expect(statusWithSlot('waitlisted', null)).toBe('Waitlisted');
  });

  it('writes places in line as ordinals, including the teens', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(112)).toBe('112th');
  });
});
