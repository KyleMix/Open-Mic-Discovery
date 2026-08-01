import { useState } from 'react';

import { Body, Field } from '@/components/ui';

export type Pin = { lat: number; lng: number };

type Props = {
  pin: Pin | null;
  onChange: (pin: Pin) => void;
};

/**
 * Web fallback for the native map pin-drop: latitude and longitude entered
 * directly. Usually filled in by the address lookup in the form above, so this
 * is a correction tool rather than the first thing a producer reaches for.
 */
export function PinPicker({ pin, onChange }: Props) {
  const [lat, setLat] = useState(pin ? String(pin.lat) : '');
  const [lng, setLng] = useState(pin ? String(pin.lng) : '');

  // Reflect a pin set from outside, which is what the address lookup does.
  // Adjusted during render rather than in an effect, the pattern React
  // documents for state that follows a prop, so the fields never paint one
  // frame of stale coordinates. Comparing the previous pin rather than the
  // text means this never fights the producer mid-edit.
  const [shownPin, setShownPin] = useState(pin);
  if (pin && pin !== shownPin && (pin.lat !== shownPin?.lat || pin.lng !== shownPin?.lng)) {
    setShownPin(pin);
    setLat(String(pin.lat));
    setLng(String(pin.lng));
  }

  function update(nextLat: string, nextLng: string) {
    setLat(nextLat);
    setLng(nextLng);
    const parsedLat = Number(nextLat);
    const parsedLng = Number(nextLng);
    if (
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      Math.abs(parsedLat) <= 90 &&
      Math.abs(parsedLng) <= 180 &&
      nextLat.trim() !== '' &&
      nextLng.trim() !== ''
    ) {
      onChange({ lat: parsedLat, lng: parsedLng });
    }
  }

  return (
    <>
      <Body>
        The tap-to-place map is in the mobile app. On web, the address lookup fills these in, or
        paste coordinates yourself (right click the spot in Google Maps and copy the numbers).
      </Body>
      <Field
        label="Latitude"
        value={lat}
        onChangeText={(v) => update(v, lng)}
        placeholder="47.6174"
        inputMode="decimal"
      />
      <Field
        label="Longitude"
        value={lng}
        onChangeText={(v) => update(lat, v)}
        placeholder="-122.3199"
        inputMode="decimal"
      />
    </>
  );
}
