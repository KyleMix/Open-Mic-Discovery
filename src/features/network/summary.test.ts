import type { ConnectionRow } from '@/features/network/queries';
import { roleLabel, splitConnections } from '@/features/network/summary';

function row(overrides: Partial<ConnectionRow>): ConnectionRow {
  return {
    requester_id: 'a',
    addressee_id: 'b',
    status: 'pending',
    created_at: '2026-08-10T00:00:00Z',
    responded_at: null,
    i_requested: false,
    other_id: 'b',
    handle: 'someone',
    stage_name: 'Someone',
    avatar_url: null,
    bio: null,
    is_performer: true,
    is_producer: false,
    link_instagram: null,
    link_tiktok: null,
    link_youtube: null,
    link_website: null,
    link_spotify: null,
    link_apple_music: null,
    ...overrides,
  };
}

describe('splitConnections', () => {
  it('separates who owes an answer from who already said yes', () => {
    const split = splitConnections([
      row({ other_id: 'p1', status: 'pending', i_requested: false }),
      row({ other_id: 'p2', status: 'pending', i_requested: true }),
      row({ other_id: 'p3', status: 'accepted', i_requested: true }),
    ]);
    expect(split.requests.map((r) => r.other_id)).toEqual(['p1']);
    expect(split.sent.map((r) => r.other_id)).toEqual(['p2']);
    expect(split.connected.map((r) => r.other_id)).toEqual(['p3']);
  });

  it('drops rows whose counterpart could not be resolved', () => {
    const split = splitConnections([
      row({ other_id: null }),
      row({ stage_name: null }),
      row({ other_id: 'ok', status: 'accepted' }),
    ]);
    expect(split.requests).toHaveLength(0);
    expect(split.sent).toHaveLength(0);
    expect(split.connected.map((r) => r.other_id)).toEqual(['ok']);
  });
});

describe('roleLabel', () => {
  it('names both roles when someone holds both', () => {
    expect(roleLabel({ is_performer: true, is_producer: true })).toBe('Performer and producer');
  });
  it('names each role alone', () => {
    expect(roleLabel({ is_performer: true, is_producer: false })).toBe('Performer');
    expect(roleLabel({ is_performer: false, is_producer: true })).toBe('Runs a mic');
  });
  it('falls back for a watcher with no roles', () => {
    expect(roleLabel({ is_performer: false, is_producer: null })).toBe('Member');
  });
});
