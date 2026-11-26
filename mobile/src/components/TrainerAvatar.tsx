import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TrainerProfile } from "../types";

export function TrainerAvatar({ profile, size = 48 }: { profile: TrainerProfile; size?: number }) {
  const scale = size / 48;
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: profile.avatarColor }]}> 
    <View style={[styles.head, { width: 18 * scale, height: 18 * scale, borderRadius: 9 * scale, top: 7 * scale }]} />
    <View style={[styles.eye, { width: 2.4 * scale, height: 2.4 * scale, borderRadius: 1.2 * scale, top: 13 * scale, left: 19 * scale }]} />
    <View style={[styles.eye, { width: 2.4 * scale, height: 2.4 * scale, borderRadius: 1.2 * scale, top: 13 * scale, right: 19 * scale }]} />
    <View style={[styles.smile, { width: 7 * scale, height: 3.5 * scale, borderBottomLeftRadius: 4 * scale, borderBottomRightRadius: 4 * scale, top: 18 * scale }]} />
    <View style={[styles.body, { width: 27 * scale, height: 20 * scale, borderTopLeftRadius: 12 * scale, borderTopRightRadius: 12 * scale, bottom: 3 * scale, backgroundColor: profile.accentColor }]} />
    {profile.accessory === "cap" && <View style={[styles.cap, { width: 21 * scale, height: 8 * scale, borderRadius: 5 * scale, top: 4 * scale, backgroundColor: profile.accentColor }]} />}
    {profile.accessory === "visor" && <View style={[styles.visor, { width: 25 * scale, height: 5 * scale, borderRadius: 3 * scale, top: 8 * scale, backgroundColor: profile.accentColor }]} />}
    {profile.accessory === "hood" && <View style={[styles.hood, { width: 25 * scale, height: 24 * scale, borderRadius: 12 * scale, top: 3 * scale, borderColor: profile.accentColor }]} />}
    <Text style={[styles.initial, { fontSize: 12 * scale, bottom: 5 * scale }]}>{profile.name.charAt(0).toUpperCase()}</Text>
  </View>;
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 2, borderColor: "#ffffff" },
  head: { position: "absolute", backgroundColor: "#f2c39b" },
  eye: { position: "absolute", backgroundColor: "#26342d" },
  smile: { position: "absolute", borderBottomWidth: 1.6, borderColor: "#26342d" },
  body: { position: "absolute", opacity: 0.95 },
  cap: { position: "absolute" },
  visor: { position: "absolute" },
  hood: { position: "absolute", backgroundColor: "transparent", borderWidth: 3 },
  initial: { position: "absolute", color: "#173c2b", fontWeight: "900" },
});
