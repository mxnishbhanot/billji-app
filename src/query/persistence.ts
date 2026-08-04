import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/** Also the key Sync settings clears when the user empties the cache. */
export const QUERY_CACHE_KEY = 'billji.queryCache.v1';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1500
});

export const queryPersistMaxAge = 24 * 60 * 60 * 1000;

export const queryPersistOptions = {
  persister: queryPersister,
  maxAge: queryPersistMaxAge,
  buster: 'v1'
};
