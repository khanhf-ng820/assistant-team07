import { fireEvent, render, screen } from '@testing-library/react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import ReceiptCaptureScreen from '../app/capture/ocr';
import { parseReceiptOcrDraft } from '../src/api/contracts';
import { ApiError } from '../src/api/errors';

const mockExtractReceipt = jest.fn();
const mockDelete = jest.fn();
const mockRequestCamera = jest.fn();
const mockTakePicture = jest.fn();
let mockCameraGranted = false;

jest.mock('expo-camera', () => {
  const React = require('react');
  return {
    CameraView: React.forwardRef(function MockCamera({ onCameraReady }: { onCameraReady: () => void }, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }), []);
      React.useEffect(() => { onCameraReady(); }, []);
      return null;
    }),
    useCameraPermissions: () => [{ granted: mockCameraGranted, canAskAgain: true }, mockRequestCamera],
  };
});

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: jest.fn(() => ({ exists: true, size: 16, base64: async () => 'fixture-image', delete: mockDelete })),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ apiClient: { extractReceipt: mockExtractReceipt } }),
}));

const output = {
  document_type: 'bank_transfer',
  amount: 35000,
  currency: 'VND',
  merchant: null,
  description: 'Bữa trưa',
  category: 'food',
  occurred_on: '2026-11-26',
  timestamp: null,
  confidence: { amount: 0.9, merchant: 0, description: 0.8, category: 0.8, timestamp: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCameraGranted = false;
  mockExtractReceipt.mockResolvedValue(parseReceiptOcrDraft(output));
  jest.mocked(launchImageLibraryAsync).mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///cache/transfer.png', width: 100, height: 100 }],
  });
});

it('captures a photo once the camera is ready and lets the user discard it', async () => {
  mockCameraGranted = true;
  mockTakePicture.mockResolvedValue({ uri: 'file:///cache/receipt.jpg' });
  await render(<ReceiptCaptureScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Mở camera' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Chụp ảnh' }));

  expect(mockTakePicture).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Ảnh đã chọn')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Bỏ ảnh' }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockExtractReceipt).not.toHaveBeenCalled();
});

it('previews one gallery image, extracts after consent, and releases the temporary copy', async () => {
  await render(<ReceiptCaptureScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Chọn ảnh từ thư viện' }));
  expect(screen.getByLabelText('Ảnh đã chọn')).toBeVisible();
  expect(mockExtractReceipt).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Đọc ảnh bằng AI' }));

  expect(mockExtractReceipt).toHaveBeenCalledWith('fixture-image', { signal: expect.any(AbortSignal) });
  expect(screen.getByRole('header', { name: 'Bản nháp từ ảnh' })).toBeVisible();
  expect(screen.getByText('35.000 ₫')).toBeVisible();
  expect(screen.getByText('Chuyển khoản')).toBeVisible();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('keeps the preview available after a transient OCR failure and accepts a retry', async () => {
  mockExtractReceipt.mockRejectedValueOnce(new ApiError({
    code: 'OCR_TIMEOUT', message: 'Timed out', retryable: true, userMessage: 'Hãy thử lại.',
  }));
  await render(<ReceiptCaptureScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Chọn ảnh từ thư viện' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Đọc ảnh bằng AI' }));

  expect(screen.getByText('Hãy thử lại.')).toBeVisible();
  expect(screen.getByLabelText('Ảnh đã chọn')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Đọc ảnh bằng AI' }));
  expect(screen.getByRole('header', { name: 'Bản nháp từ ảnh' })).toBeVisible();
});

it('keeps gallery selection available when camera permission is denied', async () => {
  mockRequestCamera.mockResolvedValue({ granted: false, canAskAgain: true });
  await render(<ReceiptCaptureScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Mở camera' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Bạn có thể cấp quyền camera hoặc chọn ảnh từ thư viện.');
  expect(screen.getByRole('button', { name: 'Chọn ảnh từ thư viện' })).toBeEnabled();
});

it('rejects malformed receipt amounts and confidence scores', () => {
  expect(() => parseReceiptOcrDraft({ ...output, amount: '35000' })).toThrow();
  expect(() => parseReceiptOcrDraft({ ...output, confidence: { ...output.confidence, amount: 2 } })).toThrow();
});
