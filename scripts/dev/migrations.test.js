const { pendingFromListing } = require('./migrations');

describe('reading which migrations the database has not run', () => {
  it('reads the box-drawing table the CLI actually prints', () => {
    // Separators are U+2502, not ASCII pipes, and the rules are U+2500.
    const listing = [
      '        LOCAL      │     REMOTE     │     TIME (UTC)      ',
      '  ─────────────────┼────────────────┼─────────────────────',
      '    20260728000100 │ 20260728000100 │ 2026-07-28 00:01:00 ',
      '    20260801000100 │ 20260801000100 │ 2026-08-01 00:01:00 ',
      '    20260801000300 │                │ 2026-08-01 00:03:00 ',
      '    20260801000400 │                │ 2026-08-01 00:04:00 ',
    ].join('\n');
    expect(pendingFromListing(listing)).toEqual(['20260801000300', '20260801000400']);
  });

  it('counts stamps rather than columns, so a reordered table still works', () => {
    // The column order has moved between CLI versions. A row with one version
    // stamp is on disk and not in the database, whichever side it sits on.
    const reordered = [
      '     REMOTE      │        LOCAL      ',
      '  20260728000100 │ 20260728000100 ',
      '                 │ 20260801000400 ',
    ].join('\n');
    expect(pendingFromListing(reordered)).toEqual(['20260801000400']);
  });

  it('says nothing is pending when every migration has been applied', () => {
    const listing = [
      '    20260728000100 │ 20260728000100 │ 2026-07-28 00:01:00 ',
      '    20260801000400 │ 20260801000400 │ 2026-08-01 00:04:00 ',
    ].join('\n');
    expect(pendingFromListing(listing)).toEqual([]);
  });

  it('ignores headers, rules, and blank output', () => {
    expect(pendingFromListing('')).toEqual([]);
    expect(pendingFromListing('  LOCAL │ REMOTE │ TIME (UTC)')).toEqual([]);
    expect(pendingFromListing('  ─────┼──────┼──────')).toEqual([]);
  });

  it('does not mistake the timestamp column for a version stamp', () => {
    // It is punctuated, so it never reads as 14 bare digits.
    const listing = '    20260801000400 │                │ 2026-08-01 00:04:00 ';
    expect(pendingFromListing(listing)).toEqual(['20260801000400']);
  });
});
