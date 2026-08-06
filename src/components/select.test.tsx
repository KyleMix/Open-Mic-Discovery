import { fireEvent, render } from '@testing-library/react-native';

import { MultiSelectField, SelectField } from './select';

const OPTIONS = [
  { value: 'a', label: 'Alpha', description: 'First choice.' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('SelectField', () => {
  it('shows the current choice on the closed trigger', async () => {
    const { getByText, queryByText } = await render(
      <SelectField label="Pick one" value="b" options={OPTIONS} onChange={jest.fn()} />,
    );
    expect(getByText('Beta')).toBeTruthy();
    expect(queryByText('Alpha')).toBeNull();
  });

  it('opens the sheet, reports the choice, and closes', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText, queryByText } = await render(
      <SelectField label="Pick one" value="b" options={OPTIONS} onChange={onChange} />,
    );
    await fireEvent.press(getByLabelText('Pick one: Beta'));
    expect(getByText('First choice.')).toBeTruthy();
    await fireEvent.press(getByText('Alpha'));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(queryByText('First choice.')).toBeNull();
  });
});

describe('MultiSelectField', () => {
  it('shows the placeholder when nothing is selected', async () => {
    const { getByText } = await render(
      <MultiSelectField
        label="Pick some"
        values={[]}
        options={OPTIONS}
        onChange={jest.fn()}
        placeholder="Any way"
      />,
    );
    expect(getByText('Any way')).toBeTruthy();
  });

  it('summarizes selections on the trigger', async () => {
    const { getByText } = await render(
      <MultiSelectField
        label="Pick some"
        values={['a', 'c']}
        options={OPTIONS}
        onChange={jest.fn()}
        placeholder="Any way"
      />,
    );
    expect(getByText('Alpha, Gamma')).toBeTruthy();
  });

  it('toggles values without closing, and closes from Done', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText, queryByText } = await render(
      <MultiSelectField
        label="Pick some"
        values={['a']}
        options={OPTIONS}
        onChange={onChange}
        placeholder="Any way"
      />,
    );
    await fireEvent.press(getByLabelText('Pick some: Alpha'));
    await fireEvent.press(getByLabelText('Beta'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    await fireEvent.press(getByLabelText('Alpha'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(getByText('Done')).toBeTruthy();
    await fireEvent.press(getByText('Done'));
    expect(queryByText('Done')).toBeNull();
  });
});
