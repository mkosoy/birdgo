import { useEffect } from "react";
import { subscribeCollectionChanged } from "../utils/collectionEvents";
import { resumePendingAutomaticCloudBackup, scheduleAutomaticCloudBackup } from "../utils/cloudSync";

export function CloudSyncAutoBackup() {
  useEffect(() => {
    void resumePendingAutomaticCloudBackup();
    return subscribeCollectionChanged(() => scheduleAutomaticCloudBackup());
  }, []);
  return null;
}
