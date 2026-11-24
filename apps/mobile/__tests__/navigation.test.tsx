import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import StatsScreen from '../app/(tabs)/index';
import SavingsScreen from '../app/(tabs)/savings';

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
};

it('starts on Stats and switches between exactly two tabs', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Tiết kiệm' }));
  expect(screen.getByRole('tab', { name: 'Tiết kiệm' })).toBeSelected();
  expect(screen.getByText('Mục tiêu tiết kiệm sẽ xuất hiện tại đây.')).toBeVisible();
});

it.each(['Thống kê', 'Tiết kiệm'])('opens and closes the same chooser from %s without changing tabs', async (tab) => {
  await renderRouter(routes, { initialUrl: '/' });
  await fireEvent.press(screen.getByRole('tab', { name: tab }));
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm giao dịch' }));

  // Manual entry is activated in Phase 1 (Issue #45)
  expect(screen.getByRole('button', { name: 'Nhập thủ công' })).toBeEnabled();

  // OCR and Voice capture remain placeholders for Phase 2
  for (const method of ['Quét hóa đơn', 'Ghi âm']) {
    expect(screen.getByRole('button', { name: `${method} — Chưa triển khai` })).toBeDisabled();
  }

  await fireEvent.press(screen.getByRole('button', { name: 'Đóng lựa chọn' }));
  expect(screen.queryByText('Chọn cách ghi giao dịch')).toBeNull();
  expect(screen.getByRole('tab', { name: tab })).toBeSelected();
});

it('opens ManualEntryModal when selecting Nhập thủ công from Tiết kiệm tab', async () => {
  await renderRouter(routes, { initialUrl: '/savings' });
  expect(screen.getByRole('tab', { name: 'Tiết kiệm' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm giao dịch' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Nhập thủ công' }));

  // Verifies ManualEntryModal mounted at root layout opens successfully from Tiết kiệm tab
  expect(screen.getByText('Thêm khoản chi')).toBeVisible();
  expect(screen.getByTestId('remaining-budget-badge')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('manual-entry-back'));
  expect(screen.queryByText('Thêm khoản chi')).toBeNull();
});
