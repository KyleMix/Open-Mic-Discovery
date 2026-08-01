import { render, screen, userEvent } from '@testing-library/react-native';

import { SeriesForm } from './series-form';

jest.mock('@/features/producer/queries', () => ({
  useVenueSearch: () => ({ data: [] }),
}));

const mockGeocode = jest.fn();
jest.mock('@/features/producer/venue-geocode', () => {
  const actual = jest.requireActual('@/features/producer/venue-geocode');
  return { ...actual, geocodeVenueAddress: (query: string) => mockGeocode(query) };
});

async function renderForm() {
  return render(
    <SeriesForm busy={false} error={null} submitLabel="Create listing" onSubmit={jest.fn()} />,
  );
}

describe('when signups open follows the signup method', () => {
  it('offers times before showtime for a walk-in list, not days', async () => {
    const user = userEvent.setup();
    await renderForm();

    // Walk-in list is the default method.
    await user.press(screen.getByText('1 hour before'));

    expect(screen.getByText('30 minutes before')).toBeTruthy();
    expect(screen.getByText('3 hours before')).toBeTruthy();
    // The point of the change: a week's lead time is meaningless for a list
    // that gets written at the venue.
    expect(screen.queryByText('1 week before')).toBeNull();
    expect(screen.queryByText('30 days before')).toBeNull();
  });

  it('switches to days ahead when the method books in advance', async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByText('Walk-in list'));
    await user.press(screen.getByText('Book ahead'));

    // The walk-in default must not survive the switch.
    expect(screen.queryByText('1 hour before')).toBeNull();
    expect(screen.getByText('1 week before')).toBeTruthy();
  });

  it('labels the field for the method', async () => {
    const user = userEvent.setup();
    await renderForm();

    expect(screen.getByText('When the list opens')).toBeTruthy();

    await user.press(screen.getByText('Walk-in list'));
    await user.press(screen.getByText('Name draw'));

    expect(screen.getByText('When signups open')).toBeTruthy();
  });
});

describe('venue location from the address', () => {
  beforeEach(() => {
    mockGeocode.mockReset();
  });

  it('waits for a complete address before spending a lookup', async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByText('Venue is not listed: add it'));
    await user.type(screen.getByLabelText('Street address'), '7035 Pacific Ave SE');

    // Street alone would geocode to whichever city the device guesses.
    expect(mockGeocode).not.toHaveBeenCalled();
    expect(screen.getByText(/fills itself in/i)).toBeTruthy();
  });

  it('fills the pin in from the address once city and state are there', async () => {
    mockGeocode.mockResolvedValue({ lat: 47.0379, lng: -122.9007 });
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByText('Venue is not listed: add it'));
    await user.type(screen.getByLabelText('Street address'), '7035 Pacific Ave SE');
    await user.type(screen.getByLabelText('City'), 'Olympia');
    await user.type(screen.getByLabelText('State'), 'WA');

    await screen.findByText(/Found it from the address/i);
    expect(mockGeocode).toHaveBeenCalledWith('7035 Pacific Ave SE, Olympia, WA');
  });

  it('leaves manual entry usable when the address cannot be found', async () => {
    mockGeocode.mockResolvedValue(null);
    const user = userEvent.setup();
    await renderForm();

    await user.press(screen.getByText('Venue is not listed: add it'));
    await user.type(screen.getByLabelText('Street address'), '1 Nowhere Rd');
    await user.type(screen.getByLabelText('City'), 'Nowhere');
    await user.type(screen.getByLabelText('State'), 'ZZ');

    // A failed lookup must never block the form: web has no device geocoder
    // at all, and it takes this path on every listing.
    await screen.findByText(/Could not find that address/i);
    expect(screen.getByText('Create listing')).toBeTruthy();
  });
});
