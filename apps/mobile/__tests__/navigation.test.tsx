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

  for (const method of ['Nhập thủ công', 'Quét hóa đơn', 'Ghi âm']) {
    expect(screen.getByRole('button', { name: `${method} — Chưa triển khai` })).toBeDisabled();
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Đóng lựa chọn' }));
  expect(screen.queryByText('Chọn cách ghi giao dịch')).toBeNull();
  expect(screen.getByRole('tab', { name: tab })).toBeSelected();
});
