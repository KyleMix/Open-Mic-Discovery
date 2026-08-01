import { uniqueChannelTopic } from './realtime';

describe('uniqueChannelTopic', () => {
  it('never repeats a topic for the same row set', () => {
    // The bug this exists for: supabase-js hands back the existing channel
    // when a topic repeats, and adding a postgres_changes callback to one
    // that has already subscribed throws. A remount must not collide with
    // the channel it is replacing.
    const first = uniqueChannelTopic('signups', 'occurrence-1');
    const second = uniqueChannelTopic('signups', 'occurrence-1');
    expect(first).not.toBe(second);
  });

  it('keeps the prefix and key readable for debugging', () => {
    expect(uniqueChannelTopic('signups', 'abc')).toMatch(/^signups-abc-\d+$/);
  });

  it('separates different rows sets and different prefixes', () => {
    const topics = new Set([
      uniqueChannelTopic('signups', 'a'),
      uniqueChannelTopic('signups', 'b'),
      uniqueChannelTopic('roster', 'a'),
    ]);
    expect(topics.size).toBe(3);
  });
});
