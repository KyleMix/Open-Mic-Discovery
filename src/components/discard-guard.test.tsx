import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { useDiscardGuard } from './discard-guard';

type BeforeRemoveEvent = {
  preventDefault: () => void;
  data: { action: { type: string } };
};

const mockListeners: Record<string, (e: BeforeRemoveEvent) => void> = {};
const mockDispatch = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: (kind: string, cb: (e: BeforeRemoveEvent) => void) => {
      mockListeners[kind] = cb;
      return () => {
        delete mockListeners[kind];
      };
    },
    dispatch: mockDispatch,
  }),
}));

function Harness({ when }: { when: boolean }) {
  const { guardElement } = useDiscardGuard({
    when,
    title: 'Discard this listing?',
    body: 'Nothing is saved yet.',
    discardLabel: 'Discard it',
  });
  return <View>{guardElement}</View>;
}

describe('useDiscardGuard', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('blocks back navigation while dirty and lets an explicit discard through', async () => {
    await render(<Harness when />);
    const preventDefault = jest.fn();
    const action = { type: 'GO_BACK' };
    await act(async () => {
      mockListeners.beforeRemove({ preventDefault, data: { action } });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Discard this listing?')).toBeTruthy();

    fireEvent.press(screen.getByText('Discard it'));
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('keeps the screen when the person backs out of discarding', async () => {
    await render(<Harness when />);
    await act(async () => {
      mockListeners.beforeRemove({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } });
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Back'));
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard this listing?')).toBeNull();
  });

  it('installs no listener when the form is clean', async () => {
    await render(<Harness when={false} />);
    expect(mockListeners.beforeRemove).toBeUndefined();
  });
});
