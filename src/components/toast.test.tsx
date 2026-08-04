import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider, useToast } from './toast';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 667 },
  insets: { top: 20, left: 0, right: 0, bottom: 0 },
};

function Harness({ onUndo }: { onUndo?: () => void }) {
  const toast = useToast();
  return (
    <>
      <Button title="plain" onPress={() => toast.show('Saved.')} />
      <Button
        title="undoable"
        onPress={() => toast.show('Removed.', { label: 'Undo', onPress: onUndo ?? (() => {}) })}
      />
    </>
  );
}

async function renderHarness(onUndo?: () => void) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ToastProvider>
        <Harness onUndo={onUndo} />
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds an undoable toast at least 7 seconds, plain toasts less', async () => {
    await renderHarness();
    await act(async () => {
      fireEvent.press(screen.getByText('undoable'));
    });
    await act(async () => {
      jest.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Removed.')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.queryByText('Removed.')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('plain'));
    });
    await act(async () => {
      jest.advanceTimersByTime(4500);
    });
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('shows one toast at a time: a new one replaces the old', async () => {
    await renderHarness();
    await act(async () => {
      fireEvent.press(screen.getByText('undoable'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('plain'));
    });
    expect(screen.queryByText('Removed.')).toBeNull();
    expect(screen.getByText('Saved.')).toBeTruthy();
  });

  it('runs the undo action once and dismisses, and the X dismisses without it', async () => {
    const onUndo = jest.fn();
    await renderHarness(onUndo);
    await act(async () => {
      fireEvent.press(screen.getByText('undoable'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Undo'));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed.')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('undoable'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dismiss message'));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed.')).toBeNull();
  });
});
