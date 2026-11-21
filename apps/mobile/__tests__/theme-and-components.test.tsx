import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Header } from '../src/components/Header';
import { Toast } from '../src/components/Toast';
import { colors, radius, shadows, spacing, theme, typography } from '../src/theme';

describe('Theme and Figma Design Tokens', () => {
  it('defines all required Figma color tokens', () => {
    expect(colors.primary).toBe('#0F766E');
    expect(colors.blue).toBe('#2563EB');
    expect(colors.savings).toBe('#F43F5E');
    expect(colors.coral).toBe('#F43F5E');
    expect(colors.warning).toBe('#F59E0B');
    expect(colors.danger).toBe('#EF4444');
    expect(colors.background).toBe('#F8FAFC');
    expect(colors.surfaceCard).toBe('#FFFFFF');
  });

  it('exports complete spacing, radius, shadows, and typography structures', () => {
    expect(spacing.md).toBe(12);
    expect(spacing.lg).toBe(16);
    expect(radius.xl).toBe(24);
    expect(shadows.floating).toBeDefined();
    expect(typography.heroAmount).toBeDefined();
    expect(typography.title).toBeDefined();
    expect(typography.heading).toBeDefined();
    expect(theme.colors).toBe(colors);
  });
});

describe('Card Component', () => {
  it('renders content correctly with variant styling', async () => {
    await render(
      <Card testID="test-card" variant="outlined" padding="md">
        <Text>Card Content</Text>
      </Card>
    );
    expect(screen.getByText('Card Content')).toBeDefined();
    expect(screen.getByTestId('test-card')).toBeDefined();
  });

  it('triggers onPress when pressable', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} accessibilityLabel="Clickable card">
        <Text>Clickable</Text>
      </Card>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Clickable card' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Button Component', () => {
  it('renders button with title and triggers onPress', async () => {
    const onPress = jest.fn();
    await render(<Button title="Xác nhận" onPress={onPress} variant="primary" />);
    const btn = screen.getByRole('button', { name: 'Xác nhận' });
    expect(btn).toBeEnabled();
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator and prevents click when loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Đang lưu" loading onPress={onPress} testID="submit-btn" />);
    const btn = screen.getByTestId('submit-btn');
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('submit-btn-loading')).toBeDefined();
  });

  it('is disabled when disabled prop is true', async () => {
    const onPress = jest.fn();
    await render(<Button title="Vô hiệu" disabled onPress={onPress} />);
    const btn = screen.getByRole('button', { name: 'Vô hiệu' });
    expect(btn).toBeDisabled();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Header Component', () => {
  it('renders title, subtitle, and triggers onBack', async () => {
    const onBack = jest.fn();
    await render(
      <Header
        title="Quản lý chi tiêu"
        subtitle="Tháng 11/2026"
        onBack={onBack}
        backAccessibilityLabel="Trở về"
      />
    );
    expect(screen.getByRole('header')).toHaveTextContent('Quản lý chi tiêu');
    expect(screen.getByText('Tháng 11/2026')).toBeDefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Trở về' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Toast Component', () => {
  it('renders message when visible and triggers onDismiss', async () => {
    const onDismiss = jest.fn();
    await render(
      <Toast
        visible
        message="Giao dịch đã lưu thành công"
        type="success"
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByText('Giao dịch đã lưu thành công')).toBeDefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', async () => {
    await render(<Toast visible={false} message="Ẩn" />);
    expect(screen.queryByText('Ẩn')).toBeNull();
  });
});
