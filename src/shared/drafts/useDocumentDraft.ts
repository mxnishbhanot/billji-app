import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { draftsApi } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { DocumentType, DraftDocument } from '@/types';
import { createDraftId, deleteDraft, DRAFT_SCHEMA_VERSION, getLatestDraft, saveDraft } from './draftStore';

// Web has no local draft store, so the server sync is its only crash safety — keep
// the window tight there. Native saves to SQLite instantly, so syncing can relax.
const SERVER_SYNC_DELAY_MS = Platform.OS === 'web' ? 1500 : 3000;

export type DraftStatus = 'idle' | 'saved' | 'syncing' | 'synced' | 'error';

// Draft autosave shared by every sales-document builder (invoices, orders, ...):
// instant local save on each change, debounced server sync, recovery on revisit,
// and a retry when connectivity returns.
export const useDocumentDraft = <TPayload,>({
  documentType,
  payload,
  hasPayloadContent,
  applyPayload
}: {
  documentType: DocumentType;
  payload: TPayload;
  hasPayloadContent: (payload: TPayload) => boolean;
  applyPayload: (payload: TPayload) => void;
}) => {
  const businessId = useAuthStore((state) => state.user?.businessId || null);
  const [currentDraftId, setCurrentDraftId] = useState(() => createDraftId(documentType));
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<DraftDocument<TPayload> | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const currentDraftIdRef = useRef(currentDraftId);
  const lastEditedAtRef = useRef<string | null>(null);
  const serverDraftIdRef = useRef<string | null>(null);
  // Draft ids that have been finalized (document created) or explicitly cleared.
  // A debounced/late sync for one of these must not re-create it locally or on the
  // server — otherwise a just-created invoice's draft resurrects and nags on the
  // next open. Keyed by id so a fresh session (new id) is never blocked.
  const finalizedDraftIdsRef = useRef<Set<string>>(new Set());
  // Latest payload mirrored into a ref so the NetInfo listener can read it without
  // being in the effect deps (otherwise it re-subscribes on every keystroke).
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const hasDraftContent = useMemo(() => hasPayloadContent(payload), [hasPayloadContent, payload]);

  const setActiveDraftId = useCallback((draftId: string) => {
    currentDraftIdRef.current = draftId;
    setCurrentDraftId(draftId);
  }, []);

  const clearDraft = useCallback(async (localDraftId: string) => {
    await deleteDraft(localDraftId);
    try {
      await draftsApi.remove(localDraftId);
    } catch {
      // Local discard must not fail because server cleanup is temporarily offline.
    }
  }, []);

  const syncDraft = useCallback(async (draft: DraftDocument<TPayload>) => {
    // A finalized/cleared draft must never be pushed back to the server.
    if (finalizedDraftIdsRef.current.has(draft.localDraftId)) return;
    try {
      const network = await NetInfo.fetch();
      if (network.isConnected === false || network.isInternetReachable === false) {
        setDraftStatus('error');
        return;
      }

      setDraftStatus('syncing');
      const synced = await draftsApi.upsert(draft.localDraftId, {
        documentType,
        schemaVersion: draft.schemaVersion,
        payload: draft.payload as Record<string, unknown>,
        dirty: false,
        lastEditedAt: draft.lastEditedAt
      });

      if (lastEditedAtRef.current !== draft.lastEditedAt || currentDraftIdRef.current !== draft.localDraftId) {
        return;
      }

      const syncedAt = synced.lastSyncedAt || new Date().toISOString();
      serverDraftIdRef.current = synced.serverDraftId || synced._id || draft.serverDraftId || null;
      await saveDraft({
        ...draft,
        serverDraftId: serverDraftIdRef.current,
        businessId: synced.businessId ? String(synced.businessId) : draft.businessId || businessId,
        dirty: false,
        lastSyncedAt: syncedAt
      });
      setIsDraftDirty(false);
      setDraftStatus('synced');
      setLastDraftSavedAt(syncedAt);
    } catch {
      setDraftStatus('error');
    }
  }, [businessId, documentType]);

  useEffect(() => {
    let mounted = true;

    const loadDraft = async () => {
      // Hydration must always complete — a failure here would permanently disable
      // the autosave effect below, so every step fails soft.
      try {
        let draft = await getLatestDraft<TPayload>(documentType, businessId);

        if (!draft) {
          try {
            const serverDraft = (await draftsApi.list(documentType))[0] as DraftDocument<TPayload> | undefined;
            if (serverDraft) {
              draft = {
                ...serverDraft,
                businessId: serverDraft.businessId ? String(serverDraft.businessId) : businessId,
                dirty: false
              };
              await saveDraft(draft);
            }
          } catch {
            draft = null;
          }
        }

        if (!mounted) return;
        if (draft && hasPayloadContent(draft.payload)) {
          setRecoveryDraft(draft);
          serverDraftIdRef.current = draft.serverDraftId || draft._id || null;
          setLastDraftSavedAt(draft.lastEditedAt);
          setDraftStatus(draft.dirty ? 'saved' : 'synced');
        }
      } finally {
        if (mounted) setDraftHydrated(true);
      }
    };

    void loadDraft();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, documentType]);

  useEffect(() => {
    if (!draftHydrated || !hasDraftContent) return undefined;
    // Don't revive a draft that was just finalized/cleared under this id.
    if (finalizedDraftIdsRef.current.has(currentDraftId)) return undefined;

    const lastEditedAt = new Date().toISOString();
    lastEditedAtRef.current = lastEditedAt;
    const draft: DraftDocument<TPayload> = {
      localDraftId: currentDraftId,
      serverDraftId: serverDraftIdRef.current,
      businessId,
      documentType,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      payload,
      dirty: true,
      lastEditedAt,
      lastSyncedAt: null
    };

    void saveDraft(draft)
      .then((persistedLocally) => {
        if (lastEditedAtRef.current !== lastEditedAt) return;
        setIsDraftDirty(true);
        // Without local persistence (e.g. web), the indicator stays quiet until the
        // server sync below reports 'syncing'/'synced'.
        if (persistedLocally) {
          setDraftStatus('saved');
          setLastDraftSavedAt(lastEditedAt);
        }
      })
      .catch(() => setDraftStatus('error'));

    const timeout = setTimeout(() => {
      void syncDraft(draft);
    }, SERVER_SYNC_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [businessId, currentDraftId, documentType, draftHydrated, hasDraftContent, payload, syncDraft]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((network) => {
      if (!draftHydrated || !hasDraftContent || !isDraftDirty) return;
      if (network.isConnected === false || network.isInternetReachable === false) return;

      const lastEditedAt = lastEditedAtRef.current || new Date().toISOString();
      void syncDraft({
        localDraftId: currentDraftIdRef.current,
        serverDraftId: serverDraftIdRef.current,
        businessId,
        documentType,
        schemaVersion: DRAFT_SCHEMA_VERSION,
        payload: payloadRef.current,
        dirty: true,
        lastEditedAt,
        lastSyncedAt: null
      });
    });

    return () => unsubscribe();
  }, [businessId, documentType, draftHydrated, hasDraftContent, isDraftDirty, syncDraft]);

  const resumeDraft = () => {
    if (!recoveryDraft) return;
    setActiveDraftId(recoveryDraft.localDraftId);
    serverDraftIdRef.current = recoveryDraft.serverDraftId || recoveryDraft._id || null;
    lastEditedAtRef.current = recoveryDraft.lastEditedAt;
    applyPayload(recoveryDraft.payload);
    setIsDraftDirty(recoveryDraft.dirty);
    setDraftStatus(recoveryDraft.dirty ? 'saved' : 'synced');
    setLastDraftSavedAt(recoveryDraft.lastEditedAt);
    setRecoveryDraft(null);
  };

  const duplicateDraft = () => {
    if (!recoveryDraft) return;
    // Copy content into a fresh draft, but remove the original — leaving it behind
    // orphans a recoverable draft that can be regenerated into a duplicate document.
    void clearDraft(recoveryDraft.localDraftId).catch(() => {});
    setActiveDraftId(createDraftId(documentType));
    serverDraftIdRef.current = null;
    lastEditedAtRef.current = null;
    applyPayload(recoveryDraft.payload);
    setIsDraftDirty(true);
    setDraftStatus('saved');
    setRecoveryDraft(null);
  };

  const discardRecoveryDraft = () => {
    if (!recoveryDraft) return;
    const draftToDiscard = recoveryDraft;
    finalizedDraftIdsRef.current.add(draftToDiscard.localDraftId);
    setRecoveryDraft(null);
    setDraftStatus('idle');
    setLastDraftSavedAt(null);
    setIsDraftDirty(false);
    setActiveDraftId(createDraftId(documentType));
    void clearDraft(draftToDiscard.localDraftId);
  };

  // Hide the recovery prompt without applying or deleting the draft — a neutral
  // "later" so a stray scrim/back tap can't silently load or destroy saved work.
  const dismissRecoveryDraft = () => setRecoveryDraft(null);

  // Call after the document is created so the now-redundant draft disappears.
  const clearActiveDraft = () => {
    const finalizedId = currentDraftIdRef.current;
    // Block any in-flight debounced sync from resurrecting this draft, then roll to
    // a fresh id so continued editing on the same screen starts a clean draft.
    finalizedDraftIdsRef.current.add(finalizedId);
    void clearDraft(finalizedId).catch(() => {});
    serverDraftIdRef.current = null;
    lastEditedAtRef.current = null;
    setActiveDraftId(createDraftId(documentType));
    setIsDraftDirty(false);
    setDraftStatus('idle');
    setLastDraftSavedAt(null);
  };

  return {
    clearActiveDraft,
    discardRecoveryDraft,
    dismissRecoveryDraft,
    draftHydrated,
    draftStatus,
    duplicateDraft,
    hasDraftContent,
    isDraftDirty,
    lastDraftSavedAt,
    recoveryDraft,
    resumeDraft
  };
};
