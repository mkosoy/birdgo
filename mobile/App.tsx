import { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MapScreen } from "./src/screens/MapScreen";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { DexScreen } from "./src/screens/DexScreen";
import type { SeenSpecies } from "./src/types";

type Tabs = { Map: undefined; Capture: { hint?: SeenSpecies } | undefined; "Bird-dex": undefined };
const Tab = createBottomTabNavigator<Tabs>();

export default function App() {
  const [captureHint, setCaptureHint] = useState<SeenSpecies | undefined>();
  return <NavigationContainer>
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: "#2f7d5b" }}>
      <Tab.Screen name="Map">{() => <MapScreen onCapture={(hint) => { setCaptureHint(hint); }} />}</Tab.Screen>
      <Tab.Screen name="Capture">{() => <CaptureScreen hint={captureHint} />}</Tab.Screen>
      <Tab.Screen name="Bird-dex" component={DexScreen} />
    </Tab.Navigator>
  </NavigationContainer>;
}
