import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SignaturePadSheet } from '@/components/SignaturePadSheet';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Button, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { authApi } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useAppDialog } from '@/components/AppDialog';
import { useAppToast } from '@/components/AppToast';
import { Screen } from '@/components/Screen';
import { TourAnchor, ANCHOR } from '@/features/onboarding';
import { queryKeys } from '@/shared/query/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { InvoiceTemplate } from '@/types';
import { alpha, appColors, fontStyles, radii, typeScale } from '@/theme/theme';
import { A4_RATIO, withFittedViewport } from '@/utils/invoicePreview';

// Professional preset accents. Index 0 (indigo) matches the brand + backend default.
const ACCENT_PRESETS = ['#4338CA', '#2563EB', '#0D9488', '#16A34A', '#475569', '#E11D48'] as const;

// Mirrors DEFAULT_INVOICE_NOTES in backend invoiceHtml.js — what prints when the
// business leaves custom notes blank. Shown as the field placeholder.
const DEFAULT_INVOICE_NOTES = 'Thank you for your business!';

const templateDefaults = (tpl?: InvoiceTemplate): InvoiceTemplate => ({
  accentColor: tpl?.accentColor || ACCENT_PRESETS[0],
  showLogo: tpl?.showLogo ?? true,
  showNotes: tpl?.showNotes ?? true,
  showSignature: tpl?.showSignature ?? false,
  signatureUrl: tpl?.signatureUrl ?? '',
  showPaymentRows: tpl?.showPaymentRows ?? true,
  notes: tpl?.notes ?? ''
});

type ToggleKey = 'showLogo' | 'showNotes' | 'showSignature' | 'showPaymentRows';
const TOGGLES: { key: ToggleKey; icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string }[] = [
  { key: 'showLogo', icon: 'image-outline', title: 'Business logo', subtitle: 'Show your logo in the header' },
  { key: 'showNotes', icon: 'note-text-outline', title: 'Notes & terms', subtitle: 'Payment terms and notes block' },
  { key: 'showSignature', icon: 'draw', title: 'Signature line', subtitle: 'Authorized signatory line' },
  { key: 'showPaymentRows', icon: 'cash-multiple', title: 'Paid & balance', subtitle: 'Paid amount and balance due rows' }
];

function SectionLabel({ title }: { title: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{title}</Text>;
}

// react-native-webview has no web implementation, so on Expo web we render the same
// HTML in a plain DOM <iframe>; on device we use the native WebView. Both show the
// identical template HTML the PDF is built from.
function PreviewSurface({ html, frameWidth }: { html: string; frameWidth: number }) {
  if (Platform.OS === 'web') {
    // Desktop iframes ignore the mobile viewport meta, so scale the fixed 794px A4
    // page down to the measured frame width. transform-origin top-left keeps it pinned.
    const scale = frameWidth > 0 ? frameWidth / 794 : 1;
    return createElement('iframe', {
      srcDoc: html,
      title: 'Invoice preview',
      scrolling: 'no',
      style: {
        border: 'none',
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        transform: `scale(${scale})`,
        transformOrigin: 'top left'
      }
    });
  }
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: withFittedViewport(html) }}
      style={styles.webview}
      scrollEnabled
      showsVerticalScrollIndicator={false}
      javaScriptEnabled={false}
      androidLayerType="software"
    />
  );
}

export function InvoiceTemplateScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isDark = theme.dark;
  const colors = useMemo(() => appColors(isDark), [isDark]);
  const { showDialog } = useAppDialog();
  const { showToast } = useAppToast();

  const profile = user?.businessProfile;
  const [tpl, setTpl] = useState<InvoiceTemplate>(templateDefaults(profile?.invoiceTemplate));
  const [prefix, setPrefix] = useState(profile?.invoicePrefix || 'INV');

  // Re-sync local edits to the stored profile when it changes (save elsewhere / late load).
  const [syncedUser, setSyncedUser] = useState(user);
  if (user !== syncedUser) {
    setSyncedUser(user);
    setTpl(templateDefaults(user?.businessProfile?.invoiceTemplate));
    setPrefix(user?.businessProfile?.invoicePrefix || 'INV');
  }

  // Live preview: fetch the same HTML the PDF uses, debounced, latest-wins.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      authApi
        .invoiceTemplatePreview(tpl)
        .then((html) => {
          if (id === requestId.current) setPreviewHtml(html);
        })
        .catch(() => {
          /* keep last good preview on transient errors */
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [tpl]);

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: async (response) => {
      await setUser(response.user);
      queryClient.invalidateQueries({ queryKey: queryKeys.report.all });
      showToast('Template saved', 'success');
    },
    onError: (error) => showDialog({ title: 'Could not save template', message: apiErrorMessage(error), tone: 'error' })
  });

  const setAccent = (accentColor: string) => setTpl((prev) => ({ ...prev, accentColor }));
  const toggle = (key: ToggleKey) => (value: boolean) => setTpl((prev) => ({ ...prev, [key]: value }));
  const setNotes = (notes: string) => setTpl((prev) => ({ ...prev, notes }));
  const onSave = () => save.mutate({ invoiceTemplate: tpl, invoicePrefix: (prefix || 'INV').trim().toUpperCase().slice(0, 12) });

  // Signature toggle needs a drawn signature. Turning it on opens the draw pad; saving a
  // signature enables it, cancelling leaves it off. Turning it off keeps the saved drawing.
  const [padVisible, setPadVisible] = useState(false);
  const onToggleSignature = (value: boolean) => {
    if (!value) return setTpl((prev) => ({ ...prev, showSignature: false }));
    if (tpl.signatureUrl) return setTpl((prev) => ({ ...prev, showSignature: true }));
    setPadVisible(true);
  };
  const onSignatureDrawn = (dataUri: string) => {
    setPadVisible(false);
    setTpl((prev) => ({ ...prev, showSignature: true, signatureUrl: dataUri }));
  };
  const removeSignature = () => setTpl((prev) => ({ ...prev, showSignature: false, signatureUrl: '' }));

  const headerAction = (
    <Button
      mode="contained"
      compact
      loading={save.isPending}
      disabled={save.isPending}
      onPress={onSave}
      style={styles.saveButton}
      contentStyle={styles.saveButtonContent}
      labelStyle={styles.saveButtonLabel}
    >
      Save
    </Button>
  );

  const cardBorder = isDark ? colors.border : alpha(colors.primaryStrong, 0.08);

  return (
    <Screen title="Invoice Template" headerAction={headerAction} contentStyle={styles.screenContent}>
      <TourAnchor anchorId={ANCHOR.invoiceTemplate}>
        <SectionLabel title="PREVIEW" />
        <View style={[styles.previewFrame, { borderColor: cardBorder }]} onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}>
          {previewHtml ? (
            <PreviewSurface html={previewHtml} frameWidth={frameWidth} />
          ) : (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          )}
        </View>
        <Text style={[styles.previewHint, { color: theme.colors.onSurfaceVariant }]}>Live preview · exactly matches the generated PDF</Text>
      </TourAnchor>

      <SectionLabel title="ACCENT COLOR" />
      <View style={[styles.colorCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        {ACCENT_PRESETS.map((color) => {
          const active = tpl.accentColor.toLowerCase() === color.toLowerCase();
          return (
            <Pressable key={color} onPress={() => setAccent(color)} style={styles.colorSwatchWrap} hitSlop={6}>
              <View style={[styles.colorSwatch, { backgroundColor: color, borderColor: active ? '#0f172a' : 'transparent' }]}>
                {active ? <Feather name="check" size={16} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel title="VISIBLE SECTIONS" />
      <View style={[styles.toggleCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        {TOGGLES.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <View style={[styles.rowDivider, { backgroundColor: cardBorder }]} /> : null}
            <View style={styles.toggleRow}>
              <View style={[styles.toggleIcon, { backgroundColor: alpha(colors.primary, isDark ? 0.22 : 0.12) }]}>
                <MaterialCommunityIcons name={row.icon} size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.toggleText}>
                <Text style={[styles.toggleTitle, { color: theme.colors.onSurface }]}>{row.title}</Text>
                <Text style={[styles.toggleSubtitle, { color: theme.colors.onSurfaceVariant }]}>{row.subtitle}</Text>
              </View>
              <Switch value={tpl[row.key]} onValueChange={row.key === 'showSignature' ? onToggleSignature : toggle(row.key)} color={theme.colors.primary} />
            </View>
          </View>
        ))}
      </View>

      {tpl.showSignature && tpl.signatureUrl ? (
        <>
          <SectionLabel title="SIGNATURE" />
          <View style={[styles.signatureCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
            <Image source={{ uri: tpl.signatureUrl }} style={styles.signaturePreview} resizeMode="contain" />
            <View style={styles.signatureActions}>
              <Button mode="outlined" compact onPress={() => setPadVisible(true)}>Redraw</Button>
              <Button mode="text" compact textColor={theme.colors.error} onPress={removeSignature}>Remove</Button>
            </View>
          </View>
        </>
      ) : null}

      <SectionLabel title="NOTES & TERMS" />
      <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <TextInput
          mode="outlined"
          label="Custom notes & terms"
          value={tpl.notes ?? ''}
          onChangeText={setNotes}
          placeholder={DEFAULT_INVOICE_NOTES}
          multiline
          numberOfLines={4}
          maxLength={1000}
          disabled={!tpl.showNotes}
          style={styles.notesInput}
        />
        <Text style={[styles.notesHint, { color: theme.colors.onSurfaceVariant }]}>
          {tpl.showNotes
            ? 'Shown on every invoice. Leave blank to use the default text above.'
            : 'Turn on “Notes & terms” above to print this block.'}
        </Text>
      </View>

      <SectionLabel title="NUMBERING" />
      <View style={[styles.numberCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
        <View style={[styles.prefixPreview, { backgroundColor: alpha(colors.primary, isDark ? 0.16 : 0.08), borderColor: alpha(colors.primary, isDark ? 0.28 : 0.16) }]}>
          <MaterialCommunityIcons name="file-document-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.prefixPreviewText, { color: theme.colors.primary }]}>{(prefix || 'INV').toUpperCase()}-0001</Text>
        </View>
        <TextInput mode="outlined" label="Invoice prefix" value={prefix} onChangeText={setPrefix} autoCapitalize="characters" maxLength={12} dense />
      </View>

      <SignaturePadSheet visible={padVisible} onClose={() => setPadVisible(false)} onSave={onSignatureDrawn} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  colorCard: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', marginBottom: 18, padding: 16 },
  colorSwatch: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
  colorSwatchWrap: { padding: 2 },
  notesCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 18, padding: 14 },
  notesHint: { ...typeScale.caption, fontSize: 12, marginTop: 8 },
  notesInput: { maxHeight: 140 },
  numberCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 18, padding: 14 },
  prefixPreview: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 7, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 7 },
  prefixPreviewText: { ...fontStyles.bold, fontSize: 12 },
  previewFrame: { aspectRatio: A4_RATIO, backgroundColor: '#ffffff', borderRadius: radii.lg, borderWidth: 1, marginBottom: 6, overflow: 'hidden' },
  previewLoading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  previewHint: { ...typeScale.caption, fontSize: 12, marginBottom: 18, textAlign: 'center' },
  rowDivider: { height: 1, marginLeft: 60 },
  saveButton: { borderRadius: radii.pill },
  saveButtonContent: { minHeight: 38, paddingHorizontal: 8 },
  saveButtonLabel: { ...fontStyles.bold, fontSize: 13, marginHorizontal: 8 },
  screenContent: { paddingTop: 8 },
  signatureActions: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  signatureCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 18, padding: 14 },
  signaturePreview: { alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: radii.md, height: 90, width: '100%' },
  sectionLabel: { ...fontStyles.bold, fontSize: 11, letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  toggleCard: { borderRadius: radii.lg, borderWidth: 1, marginBottom: 18 },
  toggleIcon: { alignItems: 'center', borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8 },
  toggleSubtitle: { ...typeScale.caption, fontSize: 12, marginTop: 2 },
  toggleText: { flex: 1, minWidth: 0 },
  toggleTitle: { ...fontStyles.bold, fontSize: 14 },
  webview: { backgroundColor: '#ffffff', flex: 1 }
});
