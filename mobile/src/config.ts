import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Coordinates } from "./types";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const NATIVE_DEFAULT = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
const configuredApiBaseUrl = extra?.apiBaseUrl?.replace(/\/$/, "");
export const API_BASE_URL = Platform.OS === "web"
  ? (__DEV__ ? configuredApiBaseUrl || NATIVE_DEFAULT : "")
  : (__DEV__ ? configuredApiBaseUrl || NATIVE_DEFAULT : configuredApiBaseUrl ?? "");
export const SF_COORDS: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
