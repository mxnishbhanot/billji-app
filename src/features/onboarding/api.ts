import { api } from '@/api/client';
import type { OnboardingProgressResponse } from './types';

export type PatchOnboardingBody = {
  orientation?: Partial<{
    tourId: string;
    version: number;
    status: string;
    currentStep: string;
  }>;
  checklist?: {
    status?: string;
    items?: Record<string, { status: string; method?: string | null; completedAt?: string | null }>;
  };
  tips?: Record<
    string,
    { status: string; seenAt?: string | null; dismissedAt?: string | null; snoozedUntil?: string | null }
  >;
};

export type ReplayOnboardingBody = {
  orientation?: boolean;
  checklist?: boolean;
  resetChecklist?: boolean;
  tipIds?: string[];
};

export const onboardingApi = {
  getProgress: () => api.get<OnboardingProgressResponse>('/onboarding/progress').then((res) => res.data),
  patchProgress: (body: PatchOnboardingBody) =>
    api.patch<OnboardingProgressResponse>('/onboarding/progress', body).then((res) => res.data),
  replay: (body: ReplayOnboardingBody) =>
    api.post<OnboardingProgressResponse>('/onboarding/replay', body).then((res) => res.data)
};
