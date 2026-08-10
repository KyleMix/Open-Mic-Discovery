/* eslint-disable @typescript-eslint/no-require-imports */
// The suite runs in America/Los_Angeles, not UTC: see scripts/dev/test.mjs
// for why, and note that TZ must be set before Node starts, so it cannot be
// done from here.

// Reanimated test support: registers the worklet-free jest implementation
// so components using useAnimatedStyle render in unit tests.
require('react-native-reanimated').setUpTests();

// react-native-maps reaches for a TurboModule that only exists in a native
// binary, so any component tree containing a map fails to even import under
// Jest. Stub it to plain views: the tests that render the producer form are
// about its logic, not about map rendering, which e2e covers on a device.
// expo-media-library's shared-object base class needs a native binary and
// throws at import time under Jest, which sinks any suite whose tree can
// reach the share sheet. The sheet's tests care about intent and caption
// logic; saving to the camera roll is a device concern, e2e territory.
jest.mock('expo-media-library', () => ({
  __esModule: true,
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  saveToLibraryAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return React.createElement(View, props, props.children);
  });
  MapView.displayName = 'MapView';
  const Marker = (props) => React.createElement(View, props, props.children);
  return { __esModule: true, default: MapView, MapView, Marker };
});
