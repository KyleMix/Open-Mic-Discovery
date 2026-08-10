import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { BrandHeader } from '@/components/logo';
import { useSession } from '@/features/auth/session';
import { useMyConnections } from '@/features/network/queries';
import { splitConnections } from '@/features/network/summary';
import { disciplineAccents, palette } from '@/theme';

export default function TabsLayout() {
  const { session } = useSession();
  const connections = useMyConnections(session?.user.id);
  // Requests waiting on this person, surfaced as a badge so an ask is seen
  // without a push. Undefined hides the badge entirely.
  const waiting = connections.data ? splitConnections(connections.data).requests.length : 0;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: palette.bgElevated, borderTopColor: palette.border },
        tabBarActiveTintColor: disciplineAccents.music,
        tabBarInactiveTintColor: palette.textFaint,
        // A quick cross-fade between tabs instead of a hard cut.
        animation: 'fade',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          headerTitle: () => <BrandHeader />,
          headerTitleAlign: 'left',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, size }) => <Ionicons name="star" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="going"
        options={{
          title: 'Going',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: 'Network',
          tabBarBadge: waiting > 0 ? waiting : undefined,
          tabBarBadgeStyle: { backgroundColor: disciplineAccents.poetry, color: palette.bg },
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="producer"
        options={{
          title: 'My mics',
          tabBarIcon: ({ color, size }) => <Ionicons name="mic" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
