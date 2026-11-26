import { useEffect, useMemo } from "react";
import { buildBird3dHtml } from "./bird3dHtml";
import type { BirdRarity } from "../types";

interface Props {
  commonName: string;
  rarity?: BirdRarity;
  height?: number;
}

export function Bird3DPreview({ commonName, rarity, height = 220 }: Props) {
  const html = useMemo(() => buildBird3dHtml({ commonName, rarity }), [commonName, rarity]);
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([html], { type: "text/html" })), [html]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);
  return <iframe sandbox="allow-scripts" src={blobUrl} title={`${commonName} 3D preview`} style={{ border: 0, width: "100%", height, borderRadius: 14, background: "#10231a" }} />;
}
