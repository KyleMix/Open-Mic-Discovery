import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { palette } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
        tabBarStyle: { backgroundColor: palette.bgElevated, borderTopColor: palette.border },
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.textDisabled,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
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
        name="producer"
        options={{
          title: 'My Mics',
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
