import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'billji.queryCache.v1',
  throttleTime: 1500
});

export const queryPersistMaxAge = 24 * 60 * 60 * 1000;

export const queryPersistOptions = {
  persister: queryPersister,
  maxAge: queryPersistMaxAge,
  buster: 'v1'
};
