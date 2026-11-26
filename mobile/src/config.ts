import Constants from "expo-constants";
import { Platform } from "react-native";
import type { Coordinates } from "./types";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const NATIVE_DEFAULT = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
const configuredApiBaseUrl = extra?.apiBaseUrl?.replace(/\/$/, "");
const productionApiBaseUrl = "https://birdgo.vercel.app";
const developmentOverride = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "")
  ?? (configuredApiBaseUrl !== productionApiBaseUrl ? configuredApiBaseUrl : undefined);
export const API_BASE_URL = Platform.OS === "web"
  ? (__DEV__ ? developmentOverride || NATIVE_DEFAULT : "")
  : (__DEV__ ? developmentOverride || NATIVE_DEFAULT : configuredApiBaseUrl ?? "");
export const SF_COORDS: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
