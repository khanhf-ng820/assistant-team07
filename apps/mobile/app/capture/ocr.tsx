import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import { launchImageLibraryAsync, UIImagePickerPreferredAssetRepresentationMode } from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReceiptOcrDraft } from '../../src/api/contracts';
import { isApiError } from '../../src/api/errors';
import { useAuth } from '../../src/auth/AuthContext';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { formatVnd } from '../../src/format';
import { colors, radius, spacing, typography } from '../../src/theme';
import { CATEGORIES, formatVietnameseDate } from '../../src/types/transaction';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_CHARS = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);

function removeTemporaryImage(uri: string | null) {
  if (!uri || !uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A cache file may already have been released by the operating system.
  }
}

function DraftResult({ draft }: { draft: ReceiptOcrDraft }) {
  const documentLabels = { receipt: 'Hóa đơn', bank_transfer: 'Chuyển khoản' };
  const timestamp = draft.timestamp && Number.isFinite(Date.parse(draft.timestamp))
    ? new Date(draft.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : null;
  const fields = [
    ['Loại ảnh', draft.document_type ? documentLabels[draft.document_type] : null],
    ['Người bán', draft.merchant],
    ['Nội dung', draft.description],
    ['Danh mục', draft.category ? CATEGORIES[draft.category].name : null],
    ['Thời gian', timestamp ?? (draft.occurred_on ? formatVietnameseDate(draft.occurred_on) : null)],
  ];

  return (
    <View style={styles.result}>
      <Text accessibilityRole="header" style={styles.resultHeading}>Bản nháp từ ảnh</Text>
      <Text style={styles.detail}>Kiểm tra kết quả đọc ảnh trước khi ghi giao dịch.</Text>
      <Text style={styles.amount}>{draft.amount === null ? 'Chưa rõ số tiền' : formatVnd(draft.amount)}</Text>
      {draft.amount !== null && draft.confidence.amount < 0.75 ? (
        <Text style={styles.detail}>Cần kiểm tra lại số tiền trên ảnh.</Text>
      ) : null}
      {fields.map(([label, value]) => (
        <View key={label} style={styles.field}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue}>{value ?? 'Chưa rõ'}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ReceiptCaptureScreen() {
  const router = useRouter();
  const { apiClient } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptOcrDraft | null>(null);
  const [busy, setBusy] = useState<'photo' | 'ocr' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const camera = useRef<CameraView>(null);
  const activeTask = useRef<AbortController | null>(null);
  const photoRef = useRef<string | null>(null);
  const sweep = useRef(new Animated.Value(0)).current;

  function setSelectedImage(uri: string | null) {
    if (photoRef.current !== uri) removeTemporaryImage(photoRef.current);
    photoRef.current = uri;
    setPhoto(uri);
  }

  useFocusEffect(useCallback(() => {
    return () => {
      activeTask.current?.abort();
      activeTask.current = null;
      removeTemporaryImage(photoRef.current);
      photoRef.current = null;
      setPhoto(null);
      setDraft(null);
      setMessage(null);
      setBusy(null);
      setCameraOpen(false);
      setReady(false);
    };
  }, []));

  const showCamera = cameraOpen && !photo && !draft && !!permission?.granted;
  useEffect(() => {
    if (!showCamera) return;
    sweep.setValue(0);
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [showCamera, sweep]);

  async function perform(action: 'photo' | 'ocr', work: (signal: AbortSignal) => Promise<void>) {
    if (activeTask.current) return;
    const controller = new AbortController();
    activeTask.current = controller;
    setBusy(action);
    setMessage(null);
    try {
      await work(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(isApiError(error) ? error.userMessage : 'Không thể mở ảnh này. Hãy thử ảnh khác.');
      }
    } finally {
      if (activeTask.current === controller) {
        activeTask.current = null;
        setBusy(null);
      }
    }
  }

  function openCamera() {
    void perform('photo', async (signal) => {
      const access = permission?.granted ? permission : await requestPermission();
      if (signal.aborted) return;
      if (!access.granted) {
        setMessage('Bạn có thể cấp quyền camera hoặc chọn ảnh từ thư viện.');
        return;
      }
      setReady(false);
      setCameraOpen(true);
    });
  }

  function selectPhoto(acquire: () => Promise<string | null>) {
    void perform('photo', async (signal) => {
      const uri = await acquire();
      if (!uri) return;
      if (signal.aborted) {
        removeTemporaryImage(uri);
        return;
      }
      setCameraOpen(false);
      setReady(false);
      setSelectedImage(uri);
    });
  }

  function readPhoto() {
    if (!photo) return;
    void perform('ocr', async (signal) => {
      const file = new File(photo);
      if (!file.exists || !file.size) {
        setMessage('Không thể mở ảnh này. Hãy thử ảnh khác.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setMessage('Ảnh phải có dung lượng tối đa 5 MB.');
        return;
      }
      const encoded = await file.base64();
      if (signal.aborted) return;
      if (encoded.length > MAX_BASE64_CHARS) {
        setMessage('Ảnh phải có dung lượng tối đa 5 MB.');
        return;
      }
      const result = await apiClient.extractReceipt(encoded, { signal });
      if (signal.aborted) return;
      setSelectedImage(null);
      setDraft(result);
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title="Quét hóa đơn"
        onBack={() => router.canGoBack() ? router.back() : router.replace('/')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {draft ? (
          <>
            <DraftResult draft={draft} />
            <Button title="Quét ảnh khác" variant="outline" onPress={() => setDraft(null)} />
          </>
        ) : (
          <>
            {!photo ? <Text style={styles.detail}>Chụp hóa đơn hoặc chọn ảnh chuyển khoản.</Text> : null}
            <View style={styles.viewfinder}>
              {photo ? (
                <Image accessibilityLabel="Ảnh đã chọn" source={{ uri: photo }} resizeMode="contain" style={styles.image} />
              ) : (
                <>
                  {showCamera ? (
                    <CameraView
                      ref={camera}
                      facing="back"
                      onCameraReady={() => setReady(true)}
                      onMountError={() => {
                        setCameraOpen(false);
                        setReady(false);
                        setMessage('Camera chưa sẵn sàng. Bạn có thể chọn ảnh từ thư viện.');
                      }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <View style={styles.guide} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {showCamera ? (
                      <Animated.View style={[styles.scanLine, {
                        transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [10, 168] }) }],
                      }]} />
                    ) : null}
                  </View>
                </>
              )}
            </View>
            {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
            {photo ? (
              <>
                <Text style={styles.detail}>Ảnh sẽ được gửi đến Google Gemini để đọc thông tin.</Text>
                <Button title={busy === 'ocr' ? 'Đang đọc ảnh…' : 'Đọc ảnh bằng AI'} onPress={readPhoto} disabled={!!busy} loading={busy === 'ocr'} />
                <Button title="Bỏ ảnh" variant="outline" disabled={!!busy} onPress={() => {
                  setSelectedImage(null);
                  setMessage(null);
                }} />
              </>
            ) : (
              <>
                {showCamera ? (
                  <Button title="Chụp ảnh" disabled={!ready || !!busy} onPress={() => {
                    selectPhoto(async () => (await camera.current?.takePictureAsync({ quality: 0.85 }))?.uri ?? null);
                  }} />
                ) : (
                  <Button title="Mở camera" onPress={openCamera} disabled={!!busy} />
                )}
                <Button title="Chọn ảnh từ thư viện" variant="outline" disabled={!!busy} onPress={() => {
                  selectPhoto(async () => {
                    const picked = await launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      quality: 0.9,
                      preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
                    });
                    return picked.canceled ? null : picked.assets[0]?.uri ?? null;
                  });
                }} />
                {permission && !permission.granted && !permission.canAskAgain ? (
                  <Button title="Mở cài đặt quyền" variant="outline" onPress={() => void Linking.openSettings()} />
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  detail: { ...typography.body, color: colors.muted },
  viewfinder: {
    height: 286, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.text,
    alignItems: 'center', justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  guide: { width: '86%', height: 180, borderColor: colors.primaryLight, borderWidth: 2, borderRadius: radius.md },
  scanLine: { height: 2, marginHorizontal: spacing.sm, backgroundColor: colors.primaryLight },
  message: { ...typography.body, color: colors.text, backgroundColor: colors.surface, padding: spacing.md },
  result: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  resultHeading: { ...typography.heading, color: colors.text },
  amount: { ...typography.heading, color: colors.primary },
  field: { gap: spacing.xs },
  fieldLabel: { ...typography.bodyBold, color: colors.text },
  fieldValue: { ...typography.body, color: colors.muted },
});
