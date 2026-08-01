import {
  buildPushMessages,
  chunkMessages,
  deadTokensFromTickets,
  settledOutboxIds,
  EXPO_MAX_MESSAGES_PER_REQUEST,
  type DeviceToken,
  type OutboxRow,
} from './messages';

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'out-1',
  profile_id: 'p-1',
  title: 'Tonight at the Rusty Fret',
  body: 'You are on the list.',
  payload: { occurrence_id: 'occ-1' },
  ...over,
});

describe('buildPushMessages', () => {
  it('sends one message per registered device', () => {
    // Somebody signed in on a phone and a tablet is owed both.
    const tokens: DeviceToken[] = [
      { profile_id: 'p-1', expo_token: 'tok-phone' },
      { profile_id: 'p-1', expo_token: 'tok-tablet' },
    ];
    const messages = buildPushMessages([row()], tokens);
    expect(messages.map((m) => m.to)).toEqual(['tok-phone', 'tok-tablet']);
    expect(messages[0]).toMatchObject({
      title: 'Tonight at the Rusty Fret',
      body: 'You are on the list.',
      data: { occurrence_id: 'occ-1' },
      sound: 'default',
      outboxId: 'out-1',
    });
  });

  it('produces nothing for somebody with no device registered', () => {
    expect(buildPushMessages([row()], [])).toEqual([]);
  });

  it('does not cross the wires between people', () => {
    const messages = buildPushMessages(
      [row({ id: 'a', profile_id: 'p-1' }), row({ id: 'b', profile_id: 'p-2', body: 'Drawn!' })],
      [
        { profile_id: 'p-1', expo_token: 'tok-1' },
        { profile_id: 'p-2', expo_token: 'tok-2' },
      ],
    );
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.to === 'tok-2')?.body).toBe('Drawn!');
    expect(messages.find((m) => m.to === 'tok-1')?.body).toBe('You are on the list.');
  });
});

describe('chunkMessages', () => {
  it('keeps every request inside the limit Expo accepts', () => {
    // The bug this exists for: the outbox is read 100 rows at a time, but a
    // row fans out per device, so 100 rows across people with two devices is
    // 200 messages in one request and Expo rejects the lot.
    const tokens: DeviceToken[] = [
      { profile_id: 'p-1', expo_token: 'tok-a' },
      { profile_id: 'p-1', expo_token: 'tok-b' },
    ];
    const rows = Array.from({ length: 100 }, (_, i) => row({ id: `out-${i}` }));
    const messages = buildPushMessages(rows, tokens);
    expect(messages).toHaveLength(200);

    const chunks = chunkMessages(messages);
    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(EXPO_MAX_MESSAGES_PER_REQUEST);
    }
    // Nothing is dropped and nothing is duplicated on the way through.
    expect(chunks.flat()).toEqual(messages);
  });

  it('sends one request when everything fits', () => {
    const messages = buildPushMessages([row()], [{ profile_id: 'p-1', expo_token: 't' }]);
    expect(chunkMessages(messages)).toEqual([messages]);
  });

  it('sends no requests when there is nothing to send', () => {
    expect(chunkMessages([])).toEqual([]);
  });

  it('refuses a chunk size that would loop forever', () => {
    expect(() => chunkMessages([], 0)).toThrow();
  });
});

describe('settledOutboxIds', () => {
  const tokens: DeviceToken[] = [{ profile_id: 'p-1', expo_token: 'tok-1' }];

  it('finishes a row whose messages were accepted', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    expect(settledOutboxIds(rows, [])).toEqual(['a', 'b']);
  });

  it('finishes a row for somebody with no device, rather than re-reading it forever', () => {
    // They are not owed a delivery, so the queue should let it go.
    expect(buildPushMessages([row({ id: 'a' })], [])).toEqual([]);
    expect(settledOutboxIds([row({ id: 'a' })], [])).toEqual(['a']);
  });

  it('leaves a failed row in the queue to be retried', () => {
    // Marking it sent after a failed request loses the notification for good,
    // which is worse than the duplicate a retry might cause.
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    const failed = buildPushMessages([row({ id: 'b' })], tokens);
    expect(settledOutboxIds(rows, failed)).toEqual(['a']);
  });
});

describe('deadTokensFromTickets', () => {
  const sent = buildPushMessages(
    [row({ id: 'a', profile_id: 'p-1' }), row({ id: 'b', profile_id: 'p-2' })],
    [
      { profile_id: 'p-1', expo_token: 'tok-live' },
      { profile_id: 'p-2', expo_token: 'tok-dead' },
    ],
  );

  it('picks out the token belonging to an app that was uninstalled', () => {
    const response = {
      data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
    };
    expect(deadTokensFromTickets(sent, response)).toEqual(['tok-dead']);
  });

  it('leaves tokens alone for errors that are not about the device', () => {
    // A rate limit or a message-too-big says nothing about the token.
    const response = {
      data: [{ status: 'ok' }, { status: 'error', details: { error: 'MessageTooBig' } }],
    };
    expect(deadTokensFromTickets(sent, response)).toEqual([]);
  });

  it('reports each dead token once even across several notifications', () => {
    const many = buildPushMessages(
      [row({ id: 'a' }), row({ id: 'b' })],
      [{ profile_id: 'p-1', expo_token: 'tok-dead' }],
    );
    const response = {
      data: [
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    };
    expect(deadTokensFromTickets(many, response)).toEqual(['tok-dead']);
  });

  it('does not fall over on a response that is not shaped as expected', () => {
    expect(deadTokensFromTickets(sent, null)).toEqual([]);
    expect(deadTokensFromTickets(sent, {})).toEqual([]);
    expect(deadTokensFromTickets(sent, { data: 'nope' })).toEqual([]);
    expect(deadTokensFromTickets(sent, { data: [null, undefined] })).toEqual([]);
  });
});
