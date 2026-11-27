type CollectionListener = () => void;

const listeners = new Set<CollectionListener>();

export function notifyCollectionChanged(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listeners must never interrupt collection writes.
    }
  });
}

export function subscribeCollectionChanged(listener: CollectionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
