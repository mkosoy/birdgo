import { useEffect } from "react";
import { subscribeCollectionChanged } from "../utils/collectionEvents";
import { scheduleAutomaticCloudBackup } from "../utils/cloudSync";

export function CloudSyncAutoBackup() {
  useEffect(() => subscribeCollectionChanged(() => scheduleAutomaticCloudBackup()), []);
  return null;
}
