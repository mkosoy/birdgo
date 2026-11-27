type CollectionListener = () => void;

const listeners = new Set<CollectionListener>();
let changeVersion = 0;

export function notifyCollectionChanged(): void {
  changeVersion += 1;
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

export function getCollectionChangeVersion(): number {
  return changeVersion;
}
