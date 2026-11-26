import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
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
  const [targetCapture, setTargetCapture] = useState<{ speciesCode?: string; commonName: string; sciName?: string | null; encounterId?: string; timestamp: number } | undefined>();
  const insets = useSafeAreaInsets();
  const navigationRef = useNavigationContainerRef<Tabs>();
  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2f7d5b",
        tabBarInactiveTintColor: "#34453c",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
        tabBarStyle: { height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 5, borderTopColor: "#d5e1d8", backgroundColor: "#fff" },
        tabBarIcon: ({ color, focused, size }) => {
          if (route.name === "Capture") {
            return <View style={styles.captureTabButton}><Ionicons name="camera" size={27} color="#fff" /></View>;
          }
          const icon: keyof typeof Ionicons.glyphMap = route.name === "Map"
            ? (focused ? "map" : "map-outline")
            : (focused ? "book" : "book-outline");
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}>
        <Tab.Screen name="Map">{() => <MapScreen targetCapture={targetCapture} onCapture={(hint) => { setCaptureHint(hint); }} />}</Tab.Screen>
        <Tab.Screen
          name="Capture"
          options={{ tabBarLabel: "Snap" }}
          listeners={{ tabPress: () => {
            if (navigationRef.getCurrentRoute()?.name !== "Capture") setCaptureHint(undefined);
          } }}
        >
          {() => <CaptureScreen hint={captureHint} onHintConsumed={() => setCaptureHint(undefined)} onCaptureSaved={(capture) => setTargetCapture({ ...capture, timestamp: Date.now() })} />}
        </Tab.Screen>
        <Tab.Screen name="Bird-dex" component={DexScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  captureTabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2f7d5b",
    borderWidth: 3,
    borderColor: "#e6f4ec",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
