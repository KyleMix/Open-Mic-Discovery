import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import createQr from 'qrcode-generator';
import Svg, { Path } from 'react-native-svg';

import { palette } from '@/theme';

/**
 * A QR code drawn with the react-native-svg already in the tree, on top of
 * qrcode-generator (zero dependencies, bundled types) instead of a wrapper
 * component library, the same make-the-small-thing-ourselves call as the
 * map clustering.
 *
 * Always rendered as dark modules on a white tile: a scanner needs that
 * contrast and the app's surfaces are dark, so the tile is part of the
 * component, not left to the caller. The padding is the quiet zone; at the
 * default 8% of the tile per side it stays at or above the two modules the
 * spec asks for on every version this app produces.
 *
 * Error correction M: the URLs encoded here are ~90 characters, and M keeps
 * the module count low enough to scan from a phone screen or a printed
 * poster, which matters more than surviving damage.
 */

type Props = {
  value: string;
  /** Outer tile size in points, quiet zone included. */
  size: number;
  style?: StyleProp<ViewStyle>;
};

export function QrCode({ value, size, style }: Props) {
  const { path, count } = useMemo(() => {
    const qr = createQr(0, 'M');
    qr.addData(value);
    qr.make();
    const moduleCount = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          d += `M${col} ${row}h1v1h-1z`;
        }
      }
    }
    return { path: d, count: moduleCount };
  }, [value]);

  const quiet = size * 0.08;
  const inner = size - quiet * 2;
  return (
    <View
      accessible={false}
      style={[
        {
          backgroundColor: '#ffffff',
          borderRadius: size * 0.06,
          padding: quiet,
          width: size,
          height: size,
        },
        style,
      ]}
    >
      <Svg width={inner} height={inner} viewBox={`0 0 ${count} ${count}`}>
        <Path d={path} fill={palette.bg} />
      </Svg>
    </View>
  );
}
