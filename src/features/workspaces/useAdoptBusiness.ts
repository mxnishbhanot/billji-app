import { useQueryClient } from '@tanstack/react-query';
import { wipeLocalBusinessData } from '@/db/wipeLocalData';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

/**
 * Become the workspace in the given user payload.
 *
 * Switching and creating both land here, deliberately: they are the same transition, and the wipe
 * is the part that must never be forgotten. Two businesses sharing one local SQLite file is how the
 * database gets wedged — one caller skipping this step would be the whole bug.
 */
export function useAdoptBusiness() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return async (user: User) => {
    await wipeLocalBusinessData();
    await setUser(user);
    queryClient.clear();
    await queryClient.invalidateQueries();
  };
}
