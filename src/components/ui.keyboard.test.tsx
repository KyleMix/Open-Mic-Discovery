import { act, render } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { Keyboard, StyleSheet, Text } from 'react-native';
import type { EmitterSubscription, KeyboardEvent } from 'react-native';

import { FormScreen, KeyboardShift } from './ui';

// The phone keyboard must never cover what someone is typing. These pin the
// two ways that regressed: an avoider that only ran on iOS (edge-to-edge
// Android never resizes the window, so the keyboard covered every low
// field), and a missing header offset (under a native header the avoider
// undershot by exactly the header height, hiding fields near the bottom).

const HEADER_HEIGHT = 96;
const LAYOUT = { x: 0, y: 0, width: 390, height: 700 };
const KEYBOARD_TOP = 400;
const KEYBOARD_OVERLAP = LAYOUT.height - KEYBOARD_TOP;

let handlers: Record<string, (event: KeyboardEvent) => void>;

beforeEach(() => {
  handlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, handler) => {
    handlers[name] = handler;
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

type Rendered = Awaited<ReturnType<typeof render>>;

/** The KeyboardAvoidingView's host view: the outermost element rendered. */
function avoiderView(result: Rendered) {
  const view = result.container.children[0];
  if (view == null || typeof view === 'string') {
    throw new Error('Expected a host view at the root.');
  }
  return view;
}

/** Lay the avoider out full screen, then bring the keyboard up under it. */
async function showKeyboard(result: Rendered) {
  const view = avoiderView(result);
  await act(async () => {
    view.props.onLayout({ persist: () => undefined, nativeEvent: { layout: LAYOUT } });
  });
  const show = handlers.keyboardWillShow ?? handlers.keyboardDidShow;
  if (!show) {
    throw new Error('The avoider never subscribed to keyboard events.');
  }
  await act(async () => {
    show({
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { height: KEYBOARD_OVERLAP, screenX: 0, screenY: KEYBOARD_TOP, width: 390 },
    } as KeyboardEvent);
  });
}

function bottomPadding(result: Rendered): number {
  return StyleSheet.flatten(avoiderView(result).props.style)?.paddingBottom ?? 0;
}

function underHeader(children: React.ReactNode) {
  return (
    <HeaderHeightContext.Provider value={HEADER_HEIGHT}>{children}</HeaderHeightContext.Provider>
  );
}

describe('FormScreen', () => {
  it('pads content above the keyboard on a headerless screen', async () => {
    const result = await render(
      <FormScreen>
        <Text>fields</Text>
      </FormScreen>,
    );
    await showKeyboard(result);
    expect(bottomPadding(result)).toBe(KEYBOARD_OVERLAP);
  });

  it('adds the native header height to the shift, or low fields stay covered', async () => {
    const result = await render(
      underHeader(
        <FormScreen>
          <Text>fields</Text>
        </FormScreen>,
      ),
    );
    await showKeyboard(result);
    expect(bottomPadding(result)).toBe(KEYBOARD_OVERLAP + HEADER_HEIGHT);
  });
});

describe('KeyboardShift', () => {
  it('pads content above the keyboard', async () => {
    const result = await render(
      <KeyboardShift grow>
        <Text>screen body</Text>
      </KeyboardShift>,
    );
    await showKeyboard(result);
    expect(bottomPadding(result)).toBe(KEYBOARD_OVERLAP);
  });

  it('ignores the header by default: sheets in a Modal cover the whole window', async () => {
    const result = await render(
      underHeader(
        <KeyboardShift>
          <Text>sheet</Text>
        </KeyboardShift>,
      ),
    );
    await showKeyboard(result);
    expect(bottomPadding(result)).toBe(KEYBOARD_OVERLAP);
  });

  it('adds the header height when marked belowHeader', async () => {
    const result = await render(
      underHeader(
        <KeyboardShift grow belowHeader>
          <Text>screen body</Text>
        </KeyboardShift>,
      ),
    );
    await showKeyboard(result);
    expect(bottomPadding(result)).toBe(KEYBOARD_OVERLAP + HEADER_HEIGHT);
  });
});
