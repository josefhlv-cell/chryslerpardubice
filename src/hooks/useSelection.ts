import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * useSelection — persistent multi-select store per admin section.
 * Selection lives OUTSIDE the collapsible children, so collapse/expand
 * does not reset the selected ids. Multiple components sharing the same
 * `sectionKey` see the same set.
 */

type Store = {
  ids: Set<string>;
  listeners: Set<() => void>;
};

const stores = new Map<string, Store>();

const getStore = (key: string): Store => {
  let s = stores.get(key);
  if (!s) {
    s = { ids: new Set(), listeners: new Set() };
    stores.set(key, s);
  }
  return s;
};

const notify = (s: Store) => {
  s.ids = new Set(s.ids);
  s.listeners.forEach((l) => l());
};

export function useSelection(sectionKey: string) {
  const store = getStore(sectionKey);
  const snapshotRef = useRef(store.ids);
  snapshotRef.current = store.ids;

  const subscribe = useCallback((cb: () => void) => {
    store.listeners.add(cb);
    return () => store.listeners.delete(cb);
  }, [store]);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const ids = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback((id: string) => {
    if (store.ids.has(id)) store.ids.delete(id);
    else store.ids.add(id);
    notify(store);
  }, [store]);

  const set = useCallback((id: string, value: boolean) => {
    if (value) store.ids.add(id); else store.ids.delete(id);
    notify(store);
  }, [store]);

  const clear = useCallback(() => {
    if (store.ids.size === 0) return;
    store.ids.clear();
    notify(store);
  }, [store]);

  const selectAll = useCallback((allIds: string[]) => {
    allIds.forEach((id) => store.ids.add(id));
    notify(store);
  }, [store]);

  const has = useCallback((id: string) => store.ids.has(id), [store]);

  return { ids, count: ids.size, toggle, set, clear, selectAll, has };
}

export default useSelection;
