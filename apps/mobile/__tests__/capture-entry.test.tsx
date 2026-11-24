import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import StatsScreen from '../app/(tabs)/index';
import SavingsScreen from '../app/(tabs)/savings';
import CaptureOcr from '../app/capture/ocr';
import CaptureVoice from '../app/capture/voice';
import CaptureManual from '../app/capture/manual';
import UnknownCapture from '../app/capture/[kind]';
import { CAPTURE_KINDS, capturePath } from '../src/capture/routes';

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
  'capture/ocr': CaptureOcr,
  'capture/voice': CaptureVoice,
  'capture/manual': CaptureManual,
  'capture/[kind]': UnknownCapture,
};

const TITLES = { ocr: 'Quét hóa đơn', voice: 'Ghi âm', manual: 'Nhập thủ công' } as const;

it.each(CAPTURE_KINDS)('opens the %s capture entry directly from its deep-link path', async (kind) => {
  await renderRouter(routes, { initialUrl: capturePath(kind) });

  expect(screen).toHavePathname(capturePath(kind));
  expect(screen.getByRole('header', { name: TITLES[kind] })).toBeVisible();
  expect(screen.getByTestId(`capture-entry-${kind}`)).toBeVisible();
});

it('never records a transaction: states that the method is not implemented', async () => {
  await renderRouter(routes, { initialUrl: '/capture/voice' });

  expect(screen.getByText('Chưa triển khai')).toBeVisible();
});

it('returns home from a capture entry', async () => {
  await renderRouter(routes, { initialUrl: '/capture/manual' });
  await fireEvent.press(screen.getByRole('button', { name: 'Về trang chủ' }));

  expect(screen).toHavePathname('/');
  expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
});

it.each(['/capture/unknown', '/capture/OCR', '/capture/camera'])(
  'redirects unknown target %s to home instead of opening a screen',
  async (url) => {
    await renderRouter(routes, { initialUrl: url });

    expect(screen).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
  },
);
