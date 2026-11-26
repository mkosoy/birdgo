import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildBird3dHtml } from "./bird3dHtml";
import type { BirdRarity } from "../types";

interface Props {
  commonName: string;
  rarity?: BirdRarity;
  height?: number;
}

export function Bird3DPreview({ commonName, rarity, height = 220 }: Props) {
  const html = useMemo(() => buildBird3dHtml({ commonName, rarity }), [commonName, rarity]);
  return <View style={[styles.container, { height }]}><WebView source={{ html }} style={styles.webview} scrollEnabled={false} originWhitelist={["*"]} /></View>;
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", borderRadius: 14, backgroundColor: "#10231a" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
