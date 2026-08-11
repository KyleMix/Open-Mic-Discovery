import { inviteMessage, INVITE_MAX } from '@/features/share/invite';

describe('inviteMessage', () => {
  it('stays under the caption cap with the link intact', () => {
    const message = inviteMessage();
    expect(message.length).toBeLessThanOrEqual(INVITE_MAX);
    expect(message).toContain('https://www.stonedgooseproductions.com/open-mics/get');
  });

  it('names both platforms, because the sender does not know the phone', () => {
    const message = inviteMessage();
    expect(message).toMatch(/iPhone/);
    expect(message).toMatch(/Android/);
  });

  it('contains no em dash', () => {
    expect(inviteMessage()).not.toContain('—');
  });
});
