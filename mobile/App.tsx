import { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MapScreen } from "./src/screens/MapScreen";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { DexScreen } from "./src/screens/DexScreen";
import type { SeenSpecies } from "./src/types";

type Tabs = { Map: undefined; Capture: { hint?: SeenSpecies } | undefined; "Bird-dex": undefined };
const Tab = createBottomTabNavigator<Tabs>();

export default function App() {
  return <SafeAreaProvider><AppTabs /></SafeAreaProvider>;
}

function AppTabs() {
  const [captureHint, setCaptureHint] = useState<SeenSpecies | undefined>();
  const insets = useSafeAreaInsets();
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2f7d5b",
        tabBarInactiveTintColor: "#34453c",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
        tabBarStyle: { height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 5, borderTopColor: "#d5e1d8", backgroundColor: "#fff" },
        tabBarIcon: ({ color, focused, size }) => {
          const icon: keyof typeof Ionicons.glyphMap = route.name === "Map"
            ? (focused ? "map" : "map-outline")
            : route.name === "Capture"
              ? (focused ? "camera" : "camera-outline")
              : (focused ? "book" : "book-outline");
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}>
        <Tab.Screen name="Map">{() => <MapScreen onCapture={(hint) => { setCaptureHint(hint); }} />}</Tab.Screen>
        <Tab.Screen name="Capture">{() => <CaptureScreen hint={captureHint} />}</Tab.Screen>
        <Tab.Screen name="Bird-dex" component={DexScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
