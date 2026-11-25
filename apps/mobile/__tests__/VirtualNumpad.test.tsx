import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { VirtualNumpad } from '../src/components/manual-entry/VirtualNumpad';

describe('VirtualNumpad', () => {
  it('renders all numeric keys, 000, and delete button', async () => {
    const onDigitPress = jest.fn();
    const onTripleZeroPress = jest.fn();
    const onDeletePress = jest.fn();

    await render(
      <VirtualNumpad
        onDigitPress={onDigitPress}
        onTripleZeroPress={onTripleZeroPress}
        onDeletePress={onDeletePress}
      />
    );

    // Verify digits 0-9
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByTestId(`numpad-key-${i}`)).toBeTruthy();
    }

    // Verify 000 key and delete key
    expect(screen.getByTestId('numpad-key-000')).toBeTruthy();
    expect(screen.getByTestId('numpad-key-delete')).toBeTruthy();
  });

  it('triggers onDigitPress with correct digit when pressed', async () => {
    const onDigitPress = jest.fn();
    const onTripleZeroPress = jest.fn();
    const onDeletePress = jest.fn();

    await render(
      <VirtualNumpad
        onDigitPress={onDigitPress}
        onTripleZeroPress={onTripleZeroPress}
        onDeletePress={onDeletePress}
      />
    );

    await fireEvent.press(screen.getByTestId('numpad-key-5'));
    expect(onDigitPress).toHaveBeenCalledWith('5');

    await fireEvent.press(screen.getByTestId('numpad-key-9'));
    expect(onDigitPress).toHaveBeenCalledWith('9');
  });

  it('triggers onTripleZeroPress when 000 key is pressed', async () => {
    const onDigitPress = jest.fn();
    const onTripleZeroPress = jest.fn();
    const onDeletePress = jest.fn();

    await render(
      <VirtualNumpad
        onDigitPress={onDigitPress}
        onTripleZeroPress={onTripleZeroPress}
        onDeletePress={onDeletePress}
      />
    );

    await fireEvent.press(screen.getByTestId('numpad-key-000'));
    expect(onTripleZeroPress).toHaveBeenCalledTimes(1);
  });

  it('triggers onDeletePress when delete button is pressed', async () => {
    const onDigitPress = jest.fn();
    const onTripleZeroPress = jest.fn();
    const onDeletePress = jest.fn();

    await render(
      <VirtualNumpad
        onDigitPress={onDigitPress}
        onTripleZeroPress={onTripleZeroPress}
        onDeletePress={onDeletePress}
      />
    );

    await fireEvent.press(screen.getByTestId('numpad-key-delete'));
    expect(onDeletePress).toHaveBeenCalledTimes(1);
  });
});
