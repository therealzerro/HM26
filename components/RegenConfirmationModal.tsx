import React, { useState, useEffect } from 'react';
import { Modal, TouchableOpacity, View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { theme } from '@/constants/theme';

interface RegenConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (force?: boolean) => void;
  scope: string;
  isLocked: boolean;
}

export function RegenConfirmationModal({
  visible,
  onClose,
  onConfirm,
  scope,
  isLocked,
}: RegenConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (visible) setConfirmText('');
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>
            {isLocked ? '⚠️ SLATE LOCKED' : '↻ Regenerate Slate'}
          </Text>
          
          <Text style={styles.body}>
            {isLocked 
              ? `A hit has already been recorded for ${scope.toUpperCase()} today. Overwriting this slate will invalidate historical statistics and ROI tracking.`
              : `This will recalculate all picks for the ${scope.toUpperCase()} scope based on the latest available data.`
            }
          </Text>

          {isLocked && (
            <View style={styles.forceContainer}>
              <Text style={styles.forceLabel}>Type FORCE to overwrite:</Text>
              <TextInput
                style={styles.input}
                placeholder="FORCE"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="characters"
                value={confirmText}
                onChangeText={setConfirmText}
              />
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnCancel]}>
              <Text style={styles.btnTextCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              disabled={isLocked && confirmText !== 'FORCE'}
              onPress={() => onConfirm(isLocked)}
              style={[
                styles.btn, 
                isLocked ? styles.btnForce : styles.btnConfirm,
                isLocked && confirmText !== 'FORCE' && styles.btnDisabled
              ]}
            >
              <Text style={styles.btnTextConfirm}>{isLocked ? 'Force Regen' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.soft,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  forceContainer: {
    marginBottom: 16,
  },
  forceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.error,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: theme.colors.surfaceLight,
  },
  btnConfirm: {
    backgroundColor: theme.colors.primary,
  },
  btnForce: {
    backgroundColor: theme.colors.error,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnTextCancel: {
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  btnTextConfirm: {
    fontWeight: '700',
    color: '#fff',
  },
});
