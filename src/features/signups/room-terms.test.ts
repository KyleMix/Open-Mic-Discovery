import { roomTerms } from './room-terms';

const startsAt = '2026-08-14T03:00:00.000Z'; // 8 PM Aug 13, America/Los_Angeles

describe('roomTerms', () => {
  it('states closes-at-showtime, set length, cost, and age together', () => {
    expect(
      roomTerms({
        startsAt,
        signupCloses: '00:00:00',
        timezone: 'America/Los_Angeles',
        setLengthMinutes: 5,
        cost: 'Free',
        ageRestriction: 'twenty_one_plus',
      }),
    ).toBe('List closes at showtime · 5 min sets · Free · 21+');
  });

  it('names the close time when the list closes before the show', () => {
    expect(
      roomTerms({
        startsAt,
        signupCloses: '00:30:00',
        timezone: 'America/Los_Angeles',
        setLengthMinutes: null,
        cost: '$5',
        ageRestriction: null,
      }),
    ).toBe('List closes 7:30 PM · $5');
  });

  it('carries the date when the close crosses to another day', () => {
    expect(
      roomTerms({
        startsAt,
        signupCloses: '1 day',
        timezone: 'America/Los_Angeles',
        setLengthMinutes: 4,
        cost: 'Free',
        ageRestriction: 'all_ages',
      }),
    ).toBe('List closes Wed, Aug 12, 8:00 PM · 4 min sets · Free · All ages');
  });
});
