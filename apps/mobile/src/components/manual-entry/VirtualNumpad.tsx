import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme';

interface VirtualNumpadProps {
  onDigitPress: (digit: string) => void;
  onTripleZeroPress: () => void;
  onDeletePress: () => void;
}

export function VirtualNumpad({
  onDigitPress,
  onTripleZeroPress,
  onDeletePress,
}: VirtualNumpadProps) {
  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['000', '0', 'delete'],
  ];

  return (
    <View style={styles.container} testID="virtual-numpad">
      {numpadRows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((key) => {
            if (key === 'delete') {
              return (
                <Pressable
                  key="key-delete"
                  accessibilityRole="button"
                  accessibilityLabel="Xóa số cuối"
                  onPress={onDeletePress}
                  style={({ pressed }) => [styles.keyButton, pressed && styles.keyPressed]}
                  testID="numpad-key-delete"
                >
                  <Text style={styles.deleteIcon}>⌫</Text>
                </Pressable>
              );
            }

            if (key === '000') {
              return (
                <Pressable
                  key="key-000"
                  accessibilityRole="button"
                  accessibilityLabel="Ba số không"
                  onPress={onTripleZeroPress}
                  style={({ pressed }) => [styles.keyButton, pressed && styles.keyPressed]}
                  testID="numpad-key-000"
                >
                  <Text style={styles.keyText}>000</Text>
                </Pressable>
              );
            }

            return (
              <Pressable
                key={`key-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`Phím số ${key}`}
                onPress={() => onDigitPress(key)}
                style={({ pressed }) => [styles.keyButton, pressed && styles.keyPressed]}
                testID={`numpad-key-${key}`}
              >
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyButton: {
    flex: 1,
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  keyPressed: {
    backgroundColor: '#F1F5F9',
    transform: [{ scale: 0.98 }],
  },
  keyText: {
    ...type.heading,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  deleteIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
});
