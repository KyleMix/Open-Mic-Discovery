import { render, screen } from '@testing-library/react-native';

import { SignUpPrompt } from './sign-up-prompt';

describe('the signup pitch', () => {
  it('leads with the benefit and offers both ways in', async () => {
    await render(
      <SignUpPrompt
        title="Save this mic"
        reason="Favorites live with your account."
        perks={['A nudge on the morning it happens']}
      />,
    );

    expect(screen.getByText('Save this mic')).toBeTruthy();
    expect(screen.getByText('Favorites live with your account.')).toBeTruthy();
    expect(screen.getByText(/A nudge on the morning it happens/)).toBeTruthy();
    // Someone who already has an account must not be pushed through signup.
    expect(screen.getByText('Create a free account')).toBeTruthy();
    expect(screen.getByText('I already have one')).toBeTruthy();
  });

  it('says the price, because the ask is the whole objection', async () => {
    await render(<SignUpPrompt title="Get on the list" reason="Your spot needs a name." />);
    expect(screen.getByText(/Free, and always will be/)).toBeTruthy();
  });

  it('renders without perks', async () => {
    await render(<SignUpPrompt title="Run a mic?" reason="Listing needs an account." />);
    expect(screen.getByText('Run a mic?')).toBeTruthy();
  });
});
