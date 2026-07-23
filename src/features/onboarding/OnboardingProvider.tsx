import { createContext, createRef, ReactNode, RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { track } from '@/services/analytics';
import { PERMISSION, usePermissions } from '@/shared/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { sessionStorage } from '@/store/sessionStorage';
import { navigateToTarget } from '@/navigation/navigationRef';
import { onboardingApi } from './api';
import { detectCompletedTasks, mergeDetectedIntoProgress, requiredTasksComplete } from './completionDetect';
import {
  ANCHOR,
  checklistTasksForRole,
  FEATURE_TOURS,
  getTourById,
  ORIENTATION_TOUR_ID
} from './registry';
import type {
  AnchorRect,
  ChecklistTaskDef,
  ChecklistTaskKey,
  OnboardingHints,
  OnboardingProgress,
  TourDefinition
} from './types';

const CACHE_PREFIX = 'billji-onboarding-v1:';
const LOCAL_FLAGS_KEY = 'billji-onboarding-local-flags';

type LocalFlags = {
  sharedInvoice?: boolean;
  openedReports?: boolean;
  viewedInvoices?: boolean;
  invoiceCreateCount?: number;
};

export type TourMode = 'spotlight' | 'tip';

export type ActiveTourState = {
  tour: TourDefinition;
  stepIndex: number;
  source: 'auto' | 'replay' | 'manual';
  mode: TourMode;
};

export type CelebrationState = { kind: 'activation' | 'checklist' } | null;

type OnboardingContextValue = {
  ready: boolean;
  progress: OnboardingProgress | null;
  hints: OnboardingHints | null;
  checklistTasks: ChecklistTaskDef[];
  /** True while the checklist journey is active and has unfinished tasks (drives the pill). */
  checklistVisible: boolean;
  checklistSheetOpen: boolean;
  setChecklistSheetOpen: (open: boolean) => void;
  welcomeVisible: boolean;
  acceptWelcome: () => void;
  declineWelcome: () => void;
  activeTour: ActiveTourState | null;
  completeTask: (key: ChecklistTaskKey, method?: 'action' | 'skipped') => void;
  dismissChecklist: () => void;
  showChecklist: () => void;
  startTour: (tourId: string, source?: ActiveTourState['source']) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  dismissTour: () => void;
  replayOrientation: () => void;
  replayChecklist: () => void;
  notifyRouteFocus: (routeName: string) => void;
  markLocalFlag: (flag: keyof LocalFlags, value?: boolean | number) => void;
  celebration: CelebrationState;
  clearCelebration: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Anchor registry lives in its own context. Its three functions are []-dep stable,
 * so consumers (TourAnchor on every tab icon + screen, and TourHost's measure poll)
 * never re-render when onboarding progress mutates — which happens on every tour step.
 */
type OnboardingAnchorsValue = {
  registerAnchor: (id: string, ref: RefObject<View | null>) => void;
  unregisterAnchor: (id: string) => void;
  measureAnchor: (id: string) => Promise<AnchorRect | null>;
};

const OnboardingAnchorsContext = createContext<OnboardingAnchorsValue | null>(null);

const queryKey = ['onboarding', 'progress'] as const;

const tourMode = (tourId: string): TourMode => (tourId === ORIENTATION_TOUR_ID ? 'spotlight' : 'tip');

async function loadLocalFlags(businessId: string): Promise<LocalFlags> {
  try {
    const raw = await sessionStorage.getItemAsync(`${LOCAL_FLAGS_KEY}:${businessId}`);
    return raw ? (JSON.parse(raw) as LocalFlags) : {};
  } catch {
    return {};
  }
}

async function saveLocalFlags(businessId: string, flags: LocalFlags) {
  try {
    await sessionStorage.setItemAsync(`${LOCAL_FLAGS_KEY}:${businessId}`, JSON.stringify(flags));
  } catch {
    // ignore
  }
}

async function cacheProgress(businessId: string, data: { progress: OnboardingProgress; hints: OnboardingHints }) {
  try {
    await sessionStorage.setItemAsync(`${CACHE_PREFIX}${businessId}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}

async function readCachedProgress(businessId: string): Promise<{ progress: OnboardingProgress; hints: OnboardingHints } | null> {
  try {
    const raw = await sessionStorage.getItemAsync(`${CACHE_PREFIX}${businessId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId || 'none';
  const roleKey = user?.roleKey;
  const queryClient = useQueryClient();

  const anchors = useRef(new Map<string, RefObject<View | null>>());
  const [localFlags, setLocalFlags] = useState<LocalFlags>({});
  const [checklistSheetOpen, setChecklistSheetOpen] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [activeTour, setActiveTour] = useState<ActiveTourState | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState>(null);
  const welcomeHandledRef = useRef(false);
  const syncingDetectionRef = useRef(false);
  const checklistCompletedRef = useRef(false);
  const routeTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors of state so event handlers can read the current value and run their
  // side effects (mutate/track/navigate) OUTSIDE the setState updater. Updaters
  // must be pure — React double-invokes them in StrictMode/dev, which would
  // otherwise double-fire PATCH requests and analytics events. Synced in an
  // effect (not during render — the compiler forbids ref writes in the body);
  // handlers only read these after commit, in response to user events.
  const activeTourRef = useRef<ActiveTourState | null>(null);
  const localFlagsRef = useRef<LocalFlags>(localFlags);

  const progressQuery = useQuery({
    queryKey: [...queryKey, businessId],
    queryFn: async () => {
      try {
        const data = await onboardingApi.getProgress();
        await cacheProgress(businessId, { progress: data.progress, hints: data.hints });
        return data;
      } catch (error) {
        const cached = await readCachedProgress(businessId);
        if (cached) return { success: true as const, ...cached };
        throw error;
      }
    },
    enabled: Boolean(user?.businessId),
    staleTime: 30_000
  });

  useEffect(() => {
    if (!user?.businessId) return;
    void loadLocalFlags(user.businessId).then(setLocalFlags);
  }, [user?.businessId]);

  useEffect(() => () => {
    if (routeTipTimerRef.current) clearTimeout(routeTipTimerRef.current);
  }, []);

  useEffect(() => {
    activeTourRef.current = activeTour;
  }, [activeTour]);

  useEffect(() => {
    localFlagsRef.current = localFlags;
  }, [localFlags]);

  const progress = progressQuery.data?.progress ?? null;
  const hints = progressQuery.data?.hints ?? null;

  const patchMutation = useMutation({
    mutationFn: onboardingApi.patchProgress,
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKey, businessId], data);
      void cacheProgress(businessId, { progress: data.progress, hints: data.hints });
    }
  });

  const replayMutation = useMutation({
    mutationFn: onboardingApi.replay,
    onSuccess: (data) => {
      queryClient.setQueryData([...queryKey, businessId], data);
      void cacheProgress(businessId, { progress: data.progress, hints: data.hints });
    }
  });

  const checklistTasks = useMemo(() => checklistTasksForRole(roleKey, can), [roleKey, can]);

  const checklistVisible = Boolean(
    progress &&
      progress.checklist.status === 'active' &&
      checklistTasks.some((t) => {
        const s = progress.checklist.items[t.key]?.status;
        return s !== 'completed' && s !== 'skipped';
      })
  );

  // Auto-complete checklist when all required (non-optional) tasks are done
  useEffect(() => {
    if (!progress || progress.checklist.status !== 'active' || checklistCompletedRef.current) return;
    const required = checklistTasks.filter((t) => !t.optional);
    if (!required.length) return;
    const allDone = required.every((t) => {
      const s = progress.checklist.items[t.key]?.status;
      return s === 'completed' || s === 'skipped';
    });
    if (!allDone) return;
    checklistCompletedRef.current = true;
    patchMutation.mutate({ checklist: { status: 'completed' } });
    track('onboarding_checklist_completed', { roleKey: roleKey || 'owner' });
    setCelebration((current) => current ?? { kind: 'checklist' });
  }, [progress, checklistTasks, roleKey]);

  // Merge detected completions
  useEffect(() => {
    if (!progress || !hints || syncingDetectionRef.current) return;
    const detected = detectCompletedTasks(hints, {
      sharedInvoice: localFlags.sharedInvoice,
      openedReports: localFlags.openedReports,
      viewedInvoices: localFlags.viewedInvoices
    });
    const { progress: merged, changedKeys } = mergeDetectedIntoProgress(progress, detected);
    if (!changedKeys.length) return;

    syncingDetectionRef.current = true;
    const items: Record<string, { status: string; method: string }> = {};
    for (const key of changedKeys) {
      const item = merged.checklist.items[key];
      if (item) {
        items[key] = { status: item.status, method: item.method || 'detected' };
        track('onboarding_checklist_item_completed', { taskKey: key, method: 'detected' });
      }
    }
    patchMutation.mutate(
      { checklist: { items } },
      {
        onSettled: () => {
          syncingDetectionRef.current = false;
        }
      }
    );
  }, [progress, hints, localFlags]);

  // First-run welcome: instead of auto-firing a tour, offer the choice once.
  useEffect(() => {
    if (!progress || !hints || welcomeHandledRef.current || activeTour) return;
    if (progress.orientation.status === 'completed' || progress.orientation.status === 'dismissed') {
      welcomeHandledRef.current = true;
      return;
    }
    if (progress.orientation.status === 'in_progress') return;
    if (hints.skipOrientation) {
      // Invitee joining a busy workspace — orientation would explain things they can see working already.
      welcomeHandledRef.current = true;
      patchMutation.mutate({ orientation: { status: 'completed', tourId: ORIENTATION_TOUR_ID, version: 1 } });
      return;
    }
    welcomeHandledRef.current = true;
    const timer = setTimeout(() => {
      setWelcomeVisible(true);
      track('onboarding_checklist_shown', { roleKey: roleKey || 'owner', itemsTotal: checklistTasks.length });
    }, 600);
    return () => clearTimeout(timer);
  }, [progress, hints, activeTour, roleKey, checklistTasks.length]);

  const registerAnchor = useCallback((id: string, ref: RefObject<View | null>) => {
    anchors.current.set(id, ref);
  }, []);

  const unregisterAnchor = useCallback((id: string) => {
    anchors.current.delete(id);
  }, []);

  const measureAnchor = useCallback((id: string) => {
    return new Promise<AnchorRect | null>((resolve) => {
      const ref = anchors.current.get(id);
      const node = ref?.current;
      if (!node || typeof node.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (!width && !height) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    });
  }, []);

  const anchorsValue = useMemo<OnboardingAnchorsValue>(
    () => ({ registerAnchor, unregisterAnchor, measureAnchor }),
    [registerAnchor, unregisterAnchor, measureAnchor]
  );

  const completeTask = useCallback(
    (key: ChecklistTaskKey, method: 'action' | 'skipped' = 'action') => {
      if (!progress) return;
      const existing = progress.checklist.items[key]?.status;
      if (existing === 'completed' || existing === 'skipped') return;
      const status = method === 'skipped' ? 'skipped' : 'completed';
      patchMutation.mutate({
        checklist: {
          items: { [key]: { status, method: method === 'skipped' ? 'skipped' : 'action' } }
        }
      });
      track('onboarding_checklist_item_completed', { taskKey: key, method });
      if (key === 'share_invoice' && method === 'action') {
        setCelebration({ kind: 'activation' });
        setChecklistSheetOpen(false);
      }
    },
    [progress, patchMutation]
  );

  const dismissChecklist = useCallback(() => {
    setChecklistSheetOpen(false);
    patchMutation.mutate({ checklist: { status: 'dismissed' } });
    const itemsDone = checklistTasks.filter((t) => {
      const s = progress?.checklist.items[t.key]?.status;
      return s === 'completed' || s === 'skipped';
    }).length;
    track('onboarding_checklist_dismissed', { itemsDone, itemsTotal: checklistTasks.length });
  }, [patchMutation, checklistTasks, progress]);

  const showChecklist = useCallback(() => {
    checklistCompletedRef.current = false;
    replayMutation.mutate({ orientation: false, checklist: true });
    setChecklistSheetOpen(true);
    track('onboarding_checklist_shown', { roleKey: roleKey || 'owner', itemsTotal: checklistTasks.length });
  }, [replayMutation, roleKey, checklistTasks.length]);

  const startTour = useCallback(
    (tourId: string, source: ActiveTourState['source'] = 'manual') => {
      const tour = getTourById(tourId);
      if (!tour) return;
      setWelcomeVisible(false);
      setChecklistSheetOpen(false);
      setActiveTour({ tour, stepIndex: 0, source, mode: tourMode(tourId) });
      // Bring the screen hosting the first step's anchor on screen; TourHost polls
      // for the anchor to mount before measuring.
      navigateToTarget(tour.steps[0]?.navigate);
      if (tourId === ORIENTATION_TOUR_ID) {
        patchMutation.mutate({
          orientation: { status: 'in_progress', tourId, version: tour.version, currentStep: tour.steps[0]?.id }
        });
        track('onboarding_orientation_started', { roleKey: roleKey || 'owner', source });
      } else {
        patchMutation.mutate({
          tips: { [tourId]: { status: 'seen' } }
        });
        track('onboarding_coachmark_shown', { tipId: tourId });
      }
      if (source === 'replay') track('onboarding_help_replay', { tourId });
    },
    [patchMutation, roleKey]
  );

  const acceptWelcome = useCallback(() => {
    setWelcomeVisible(false);
    startTour(ORIENTATION_TOUR_ID, 'auto');
  }, [startTour]);

  const declineWelcome = useCallback(() => {
    setWelcomeVisible(false);
    patchMutation.mutate({ orientation: { status: 'dismissed', currentStep: 'welcome' } });
    track('onboarding_orientation_dismissed', { tourId: ORIENTATION_TOUR_ID, stepId: 'welcome' });
  }, [patchMutation]);

  const nextTourStep = useCallback(() => {
    const current = activeTourRef.current;
    if (!current) return;
    const step = current.tour.steps[current.stepIndex];
    track('onboarding_orientation_step', {
      tourId: current.tour.id,
      stepId: step?.id || '',
      action: 'next'
    });
    if (current.stepIndex >= current.tour.steps.length - 1) {
      if (current.tour.id === ORIENTATION_TOUR_ID) {
        patchMutation.mutate({ orientation: { status: 'completed', currentStep: step?.id } });
        track('onboarding_orientation_completed', {
          tourId: current.tour.id,
          stepsCompleted: current.tour.steps.length
        });
      } else {
        patchMutation.mutate({ tips: { [current.tour.id]: { status: 'completed' } } });
      }
      setActiveTour(null);
      return;
    }
    const nextIndex = current.stepIndex + 1;
    navigateToTarget(current.tour.steps[nextIndex]?.navigate);
    if (current.tour.id === ORIENTATION_TOUR_ID) {
      patchMutation.mutate({
        orientation: { status: 'in_progress', currentStep: current.tour.steps[nextIndex]?.id }
      });
    }
    setActiveTour({ ...current, stepIndex: nextIndex });
  }, [patchMutation]);

  const prevTourStep = useCallback(() => {
    const current = activeTourRef.current;
    if (!current || current.stepIndex <= 0) return;
    track('onboarding_orientation_step', {
      tourId: current.tour.id,
      stepId: current.tour.steps[current.stepIndex]?.id || '',
      action: 'back'
    });
    const prevIndex = current.stepIndex - 1;
    navigateToTarget(current.tour.steps[prevIndex]?.navigate);
    setActiveTour({ ...current, stepIndex: prevIndex });
  }, []);

  const dismissTour = useCallback(() => {
    const current = activeTourRef.current;
    if (!current) return;
    const stepId = current.tour.steps[current.stepIndex]?.id || '';
    if (current.tour.id === ORIENTATION_TOUR_ID) {
      patchMutation.mutate({ orientation: { status: 'dismissed', currentStep: stepId } });
      track('onboarding_orientation_dismissed', { tourId: current.tour.id, stepId });
    } else {
      patchMutation.mutate({ tips: { [current.tour.id]: { status: 'dismissed' } } });
      track('onboarding_coachmark_dismissed', { tipId: current.tour.id });
    }
    setActiveTour(null);
  }, [patchMutation]);

  const replayOrientation = useCallback(() => {
    replayMutation.mutate(
      { orientation: true, checklist: false },
      {
        onSuccess: () => {
          welcomeHandledRef.current = true;
          startTour(ORIENTATION_TOUR_ID, 'replay');
        }
      }
    );
  }, [replayMutation, startTour]);

  const replayChecklist = useCallback(() => {
    showChecklist();
  }, [showChecklist]);

  const markLocalFlag = useCallback(
    (flag: keyof LocalFlags, value: boolean | number = true) => {
      const prev = localFlagsRef.current;
      let nextValue: boolean | number = value;
      if (flag === 'invoiceCreateCount') {
        const current = typeof prev.invoiceCreateCount === 'number' ? prev.invoiceCreateCount : 0;
        nextValue = typeof value === 'number' && value > 1 ? value : current + 1;
      }
      // Bail out on no-op writes — route-focus notifications repeat, and a new
      // object here would re-render the provider and loop the route listener.
      if (prev[flag] !== nextValue) {
        const next = { ...prev, [flag]: nextValue };
        localFlagsRef.current = next;
        setLocalFlags(next);
        if (user?.businessId) void saveLocalFlags(user.businessId, next);

        if (flag === 'invoiceCreateCount' && typeof nextValue === 'number' && nextValue >= 3) {
          if (!activeTour && progress && can(PERMISSION.productsManage)) {
            const tip = getTourById('products-speed-v1');
            const tipState = progress.tips['products-speed-v1'];
            if (tip && (!tipState || tipState.status === 'pending') && requiredTasksComplete(progress, tip.requiredTasks)) {
              startTour('products-speed-v1', 'auto');
            }
          }
        }
      }
      if (flag === 'sharedInvoice' && value === true) completeTask('share_invoice', 'action');
    },
    [completeTask, activeTour, progress, can, startTour, user?.businessId]
  );

  const notifyRouteFocus = useCallback(
    (routeName: string) => {
      // Any route change cancels a pending tip — it was armed for the previous screen.
      if (routeTipTimerRef.current) {
        clearTimeout(routeTipTimerRef.current);
        routeTipTimerRef.current = null;
      }
      if (activeTour || welcomeVisible || !progress) return;

      if (routeName === 'Reports') {
        markLocalFlag('openedReports', true);
        completeTask('open_reports', 'action');
      }
      if (routeName === 'InvoiceList') {
        markLocalFlag('viewedInvoices', true);
        completeTask('view_invoices', 'action');
      }

      const tip = FEATURE_TOURS.find((t) => t.trigger === 'route_focus' && t.route === routeName);
      if (!tip) return;
      if (tip.requiredPermissions?.some((p) => !can(p))) return;
      if (!requiredTasksComplete(progress, tip.requiredTasks)) return;
      const tipState = progress.tips[tip.id];
      if (tipState && tipState.status !== 'pending') return;
      if (tipState?.snoozedUntil && new Date(tipState.snoozedUntil) > new Date()) return;

      routeTipTimerRef.current = setTimeout(() => startTour(tip.id, 'auto'), 1000);
    },
    [activeTour, welcomeVisible, progress, can, completeTask, markLocalFlag, startTour]
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ready: progressQuery.isSuccess || progressQuery.isError,
      progress,
      hints,
      checklistTasks,
      checklistVisible,
      checklistSheetOpen,
      setChecklistSheetOpen,
      welcomeVisible,
      acceptWelcome,
      declineWelcome,
      activeTour,
      completeTask,
      dismissChecklist,
      showChecklist,
      startTour,
      nextTourStep,
      prevTourStep,
      dismissTour,
      replayOrientation,
      replayChecklist,
      notifyRouteFocus,
      markLocalFlag,
      celebration,
      clearCelebration: () => setCelebration(null)
    }),
    [
      progressQuery.isSuccess,
      progressQuery.isError,
      progress,
      hints,
      checklistTasks,
      checklistVisible,
      checklistSheetOpen,
      welcomeVisible,
      acceptWelcome,
      declineWelcome,
      activeTour,
      completeTask,
      dismissChecklist,
      showChecklist,
      startTour,
      nextTourStep,
      prevTourStep,
      dismissTour,
      replayOrientation,
      replayChecklist,
      notifyRouteFocus,
      markLocalFlag,
      celebration
    ]
  );

  return (
    <OnboardingAnchorsContext.Provider value={anchorsValue}>
      <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
    </OnboardingAnchorsContext.Provider>
  );
}

/** Anchor registry only — stable across progress mutations. Use in TourAnchor / measure paths. */
export function useOnboardingAnchors() {
  return useContext(OnboardingAnchorsContext);
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

export function useOnboardingOptional() {
  return useContext(OnboardingContext);
}

/** Stable empty ref factory for optional anchors outside provider. */
export function createAnchorRef() {
  return createRef<View>();
}

export { ANCHOR };
