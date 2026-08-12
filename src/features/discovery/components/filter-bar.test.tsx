/**
 * The rebuilt filter bar: one obvious Filters button instead of sideways
 * scrolling chip rows that cut off past the screen edge. The bar shows
 * only applied filters (each dismissible), the sheet leads with the main
 * questions, and the advanced sections live behind an expander that
 * arrives already open when any of them is filtering.
 */
import { fireEvent, render } from '@testing-library/react-native';

import { FilterBar } from '@/features/discovery/components/filter-bar';
import { DEFAULT_FILTERS, useFiltersStore } from '@/stores/filters';

beforeEach(() => {
  useFiltersStore.setState({ ...DEFAULT_FILTERS, view: 'list', disciplinesSeeded: true });
});

describe('FilterBar', () => {
  it('shows the Filters button and the radius, nothing else, at defaults', async () => {
    const view = await render(<FilterBar />);
    expect(view.getByLabelText('Filters')).toBeTruthy();
    expect(view.getByText(/^Within /)).toBeTruthy();
    expect(view.queryByText('Clear all')).toBeNull();
    // No selection chips: nothing is applied.
    expect(view.queryByText(/✕/)).toBeNull();
  });

  it('counts applied filters on the button and shows each as a dismissible chip', async () => {
    useFiltersStore.setState({ disciplines: ['comedy'], when: 'tonight', freeOnly: true });
    const view = await render(<FilterBar />);
    expect(view.getByLabelText('Filters, 3 active')).toBeTruthy();
    expect(view.getByText('Comedy ✕')).toBeTruthy();
    expect(view.getByText('Tonight ✕')).toBeTruthy();
    expect(view.getByText('Free ✕')).toBeTruthy();
    expect(view.getByText('Clear all')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Remove filter: Tonight'));
    expect(useFiltersStore.getState().when).toBeNull();
  });

  it('clears everything from the Clear all chip', async () => {
    useFiltersStore.setState({ disciplines: ['music'], freeOnly: true, radiusKm: 8 });
    const view = await render(<FilterBar />);
    await fireEvent.press(view.getByText('Clear all'));
    const state = useFiltersStore.getState();
    expect(state.disciplines).toEqual([]);
    expect(state.freeOnly).toBe(false);
    expect(state.radiusKm).toBe(DEFAULT_FILTERS.radiusKm);
  });

  it('opens the sheet with the main questions visible and advanced folded', async () => {
    const view = await render(<FilterBar />);
    await fireEvent.press(view.getByLabelText('Filters'));

    expect(view.getByText('What kind of mic?')).toBeTruthy();
    expect(view.getByText('When?')).toBeTruthy();
    expect(view.getByText('Free mics only')).toBeTruthy();
    expect(view.getByText('Advanced filters')).toBeTruthy();
    expect(view.queryByText('Which days?')).toBeNull();
    expect(view.queryByText('How far will you go?')).toBeNull();
  });

  it('expands the advanced sections from the Advanced filters button', async () => {
    const view = await render(<FilterBar />);
    await fireEvent.press(view.getByLabelText('Filters'));
    await fireEvent.press(view.getByText('Advanced filters'));

    expect(view.getByText('Which days?')).toBeTruthy();
    expect(view.getByText('What time?')).toBeTruthy();
    expect(view.getByText('Who can get in?')).toBeTruthy();
    expect(view.getByText('How far will you go?')).toBeTruthy();
  });

  it('opens with advanced already expanded when an advanced filter applies', async () => {
    useFiltersStore.setState({ timeOfDay: 'late', radiusKm: 8 });
    const view = await render(<FilterBar />);
    await fireEvent.press(view.getByLabelText('Filters, 2 active'));

    expect(view.getByText('Advanced filters (2)')).toBeTruthy();
    expect(view.getByText('Which days?')).toBeTruthy();
  });

  it('selects a discipline and a quick pick from the sheet, visible in the bar', async () => {
    const view = await render(<FilterBar />);
    await fireEvent.press(view.getByLabelText('Filters'));
    await fireEvent.press(view.getByLabelText('Music'));
    await fireEvent.press(view.getByLabelText('This week'));

    expect(useFiltersStore.getState().disciplines).toEqual(['music']);
    expect(useFiltersStore.getState().when).toBe('week');
    // The bar reflects the same state as applied chips.
    expect(view.getByText('Music ✕')).toBeTruthy();
    expect(view.getByText('This week ✕')).toBeTruthy();
  });
});
