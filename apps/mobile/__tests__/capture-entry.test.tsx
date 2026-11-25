import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import StatsScreen from '../app/(tabs)/index';
import SavingsScreen from '../app/(tabs)/savings';
import CaptureOcr from '../app/capture/ocr';
import CaptureVoice from '../app/capture/voice';
import CaptureManual from '../app/capture/manual';
import UnknownCapture from '../app/capture/[kind]';
import NotFoundRoute from '../app/+not-found';
import { capturePath } from '../src/capture/routes';

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
  'capture/ocr': CaptureOcr,
  'capture/voice': CaptureVoice,
  'capture/manual': CaptureManual,
  'capture/[kind]': UnknownCapture,
  '+not-found': NotFoundRoute,
};

const PLACEHOLDER_TITLES = { ocr: 'Quét hóa đơn', voice: 'Ghi âm' } as const;

it.each(['ocr', 'voice'] as const)(
  'opens the %s capture entry placeholder directly from its deep-link path',
  async (kind) => {
    await renderRouter(routes, { initialUrl: capturePath(kind) });

    expect(screen).toHavePathname(capturePath(kind));
    expect(screen.getByRole('header', { name: PLACEHOLDER_TITLES[kind] })).toBeVisible();
    expect(screen.getByTestId(`capture-entry-${kind}`)).toBeVisible();
    expect(screen.getByText('Chưa triển khai')).toBeVisible();
  },
);

it('returns home from a placeholder capture entry', async () => {
  await renderRouter(routes, { initialUrl: '/capture/voice' });
  await fireEvent.press(screen.getByRole('button', { name: 'Về trang chủ' }));

  expect(screen).toHavePathname('/');
  expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
});

it('opens ManualEntryModal from carenta://capture/manual and restores home on back', async () => {
  await renderRouter(routes, { initialUrl: capturePath('manual') });

  expect(screen).toHavePathname('/');
  expect(screen.getByText('Thêm khoản chi')).toBeVisible();
  expect(screen.getByTestId('remaining-budget-badge')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('manual-entry-back'));
  expect(screen.queryByText('Thêm khoản chi')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
});

it.each(['/capture/unknown', '/capture/OCR', '/capture/camera', '/evil/capture/voice'])(
  'redirects unknown or non-allowlisted target %s to home instead of opening a screen',
  async (url) => {
    await renderRouter(routes, { initialUrl: url });

    expect(screen).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
  },
);
