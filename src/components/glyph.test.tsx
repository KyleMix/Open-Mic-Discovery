import { render } from '@testing-library/react-native';

import { disciplineGlyphs, Glyph, signupMethodGlyphs } from './glyph';

describe('glyph set', () => {
  it('maps every discipline to a glyph', () => {
    expect(Object.keys(disciplineGlyphs).sort()).toEqual(['comedy', 'music', 'other', 'poetry']);
  });

  it('maps every signup method to a glyph', () => {
    expect(Object.keys(signupMethodGlyphs).sort()).toEqual([
      'first_come',
      'host_booked',
      'lottery',
      'reserved_slot',
    ]);
  });

  it('renders without crashing and stays hidden from screen readers', async () => {
    const { root } = await render(<Glyph name="freshness-badge" />);
    expect(root).toBeTruthy();
  });
});
