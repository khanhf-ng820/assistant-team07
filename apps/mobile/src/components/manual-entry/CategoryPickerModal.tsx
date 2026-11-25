import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme';
import { CATEGORIES, Category, CategoryId } from '../../types/transaction';

interface CategoryPickerModalProps {
  visible: boolean;
  selectedCategoryId: CategoryId;
  onSelectCategory: (category: Category) => void;
  onClose: () => void;
}

export function CategoryPickerModal({
  visible,
  selectedCategoryId,
  onSelectCategory,
  onClose,
}: CategoryPickerModalProps) {
  const categoryList = Object.values(CATEGORIES);

  return (
    <Modal
      testID="category-picker-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Chọn danh mục chi tiêu
          </Text>

          <ScrollView style={styles.listContainer}>
            {categoryList.map((cat) => {
              const isSelected = cat.id === selectedCategoryId;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Danh mục ${cat.name}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelectCategory(cat);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.itemRow,
                    isSelected && styles.itemRowSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`category-option-${cat.id}`}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: cat.backgroundColor },
                    ]}
                  >
                    <Text style={styles.iconSymbol}>{cat.iconSymbol}</Text>
                  </View>
                  <Text style={[styles.categoryName, isSelected && styles.categoryNameSelected]}>
                    {cat.name}
                  </Text>
                  {isSelected ? <Text style={styles.checkIcon}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng chọn danh mục"
            onPress={onClose}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayBackdropDark,
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    maxHeight: '75%',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalTitle: {
    ...type.heading,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  listContainer: {
    maxHeight: 320,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 12,
  },
  itemRowSelected: {
    backgroundColor: colors.primaryTint,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSymbol: {
    fontSize: 20,
  },
  categoryName: {
    flex: 1,
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  categoryNameSelected: {
    color: colors.primary,
  },
  checkIcon: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },
  cancelButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...type.bodyBold,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});
