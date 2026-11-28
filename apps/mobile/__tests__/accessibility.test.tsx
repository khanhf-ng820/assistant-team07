import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Button } from '../src/components/Button';
import { CaptureChooser } from '../src/components/CaptureChooser';
import { Header } from '../src/components/Header';
import { TOAST_BADGE_CONFIG, Toast, type ToastType } from '../src/components/Toast';
import { colors } from '../src/theme';

/**
 * W3C WCAG 2.1 Relative Luminance & Contrast Ratio calculation.
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(...hexToRgb(hex1));
  const lum2 = getLuminance(...hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG 2.1 AA Color Contrast Audit', () => {
  it.each(['savings', 'danger'] as const)(
    'enabled %s Button variant label meets WCAG AA contrast (>= 4.5:1)',
    async (variant) => {
      const { getByRole, getByText } = await render(
        <Button title="Action" variant={variant} />,
      );
      const buttonStyle = StyleSheet.flatten(
        getByRole('button', { name: 'Action' }).props.style,
      );
      const labelStyle = StyleSheet.flatten(getByText('Action').props.style);

      expect(
        getContrastRatio(labelStyle.color, buttonStyle.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('primary text on white surface meets WCAG AAA threshold (>= 7.0:1)', () => {
    const ratio = getContrastRatio(colors.text, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });

  it('secondary text on white surface meets WCAG AA threshold (>= 4.5:1)', () => {
    const ratio = getContrastRatio(colors.textSecondary, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('primary brand teal on white surface meets WCAG AA threshold (>= 4.5:1)', () => {
    const ratio = getContrastRatio(colors.primary, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['success', 'warning', 'error', 'info'] as ToastType[])(
    'Toast %s badge icon foreground/background contrast meets WCAG AA (>= 4.5:1)',
    (type) => {
      const { fg, bg } = TOAST_BADGE_CONFIG[type];
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe('Touch Target Compliance (>= 48x48dp)', () => {
  it('small Button maintains >= 48x48dp minimum touch dimensions', async () => {
    const { getByTestId } = await render(<Button title="Small" size="sm" testID="btn-sm" />);
    const btn = getByTestId('btn-sm');
    expect(btn.props.style.some((s: any) => s && s.minHeight >= 48 && s.minWidth >= 48)).toBe(true);
  });

  it('medium Button maintains >= 48x48dp minimum touch dimensions', async () => {
    const { getByTestId } = await render(<Button title="Medium" size="md" testID="btn-md" />);
    const btn = getByTestId('btn-md');
    expect(btn.props.style.some((s: any) => s && s.minHeight >= 48 && s.minWidth >= 48)).toBe(true);
  });

  it('Header back button meets >= 48x48dp dimensions', async () => {
    const onBack = jest.fn();
    const { getByRole } = await render(
      <Header title="Tiêu đề" onBack={onBack} backAccessibilityLabel="Quay lại" />
    );
    const backBtn = getByRole('button', { name: 'Quay lại' });
    expect(backBtn.props.style).toEqual(
      expect.objectContaining({
        width: 48,
        height: 48,
      })
    );
  });

  it('Toast dismiss button has >= 48dp touch bounds and hitSlop', async () => {
    const onDismiss = jest.fn();
    const { getByRole } = await render(<Toast visible message="Thông báo" onDismiss={onDismiss} />);
    const closeBtn = getByRole('button', { name: 'Đóng thông báo' });
    expect(closeBtn.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    expect(closeBtn.props.style).toEqual(
      expect.objectContaining({
        minWidth: 48,
        minHeight: 48,
      })
    );
  });

  it('CaptureChooser capture options provide >= 64dp touch target height', async () => {
    const { getByRole } = await render(<CaptureChooser visible onClose={jest.fn()} />);
    const optionBtn = getByRole('button', { name: 'Nhập thủ công — Chưa triển khai' });
    expect(optionBtn.props.style.some((s: any) => s && s.minHeight >= 64)).toBe(true);
  });
});

describe('Accessibility Roles & Screen Reader Attributes', () => {
  it('Button exposes accessible role and disabled/busy states correctly', async () => {
    const { getByTestId } = await render(<Button title="Xác nhận" loading disabled testID="a11y-btn" />);
    const btn = getByTestId('a11y-btn');
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('Header renders role header for screen readers', async () => {
    const { getByRole } = await render(<Header title="Trang tổng quan" />);
    expect(getByRole('header')).toBeDefined();
  });

  it('Toast renders role alert with live region assertive', async () => {
    const { getByTestId } = await render(
      <Toast visible message="Lỗi hệ thống" type="error" testID="a11y-toast" />
    );
    const toast = getByTestId('a11y-toast');
    expect(toast.props.accessibilityRole).toBe('alert');
    expect(toast.props.accessibilityLiveRegion).toBe('assertive');
  });
});
