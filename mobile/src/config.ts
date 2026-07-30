import Constants from "expo-constants";
import type { Coordinates } from "./types";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
export const API_BASE_URL = extra?.apiBaseUrl ?? "http://localhost:4000";
export const SF_COORDS: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
