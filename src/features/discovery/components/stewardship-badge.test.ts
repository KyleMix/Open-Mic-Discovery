import { cardStewardship, stewardshipLabel } from './stewardship-badge';

describe('cardStewardship', () => {
  it('returns nothing before the migration lands (no owner_id field)', () => {
    expect(cardStewardship({ series_id: 's1', title: 'Mic' })).toBeNull();
  });

  it('distinguishes host-managed from community-listed once the field exists', () => {
    expect(cardStewardship({ owner_id: 'u1' })).toEqual({ ownerId: 'u1' });
    expect(cardStewardship({ owner_id: null })).toEqual({ ownerId: null });
  });
});

describe('stewardshipLabel', () => {
  it('names all three stewardship states', () => {
    expect(stewardshipLabel('u1', false)).toBe('Host-managed');
    expect(stewardshipLabel('u1', true)).toBe('Verified host');
    expect(stewardshipLabel(null, false)).toBe('Community-listed');
  });
});
