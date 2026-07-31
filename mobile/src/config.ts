import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Coordinates } from "./types";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const NATIVE_DEFAULT = "http://localhost:4000";
export const API_BASE_URL = Platform.OS === "web"
  ? (__DEV__ ? extra?.apiBaseUrl || NATIVE_DEFAULT : "")
  : extra?.apiBaseUrl || NATIVE_DEFAULT;
export const SF_COORDS: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
