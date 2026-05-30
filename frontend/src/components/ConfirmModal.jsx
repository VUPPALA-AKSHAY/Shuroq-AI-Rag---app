import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmModal = ({
  isOpen,
  title = "Confirm Deletion",
  message = "Are you sure you want to delete this?",
  confirmText = "Delete",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDangerous = true,
  isLoading: propLoading = false
}) => {
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLocalLoading(false);
    }
  }, [isOpen]);

  const isLoading = propLoading || localLoading;

  const handleConfirm = async (e) => {
    if (isLoading) return;
    setLocalLoading(true);
    try {
      await onConfirm?.();
    } catch (err) {
      console.error(err);
      setLocalLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isLoading) onCancel();
          }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-surface-container-low border border-outline-variant/30 shadow-2xl rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 overflow-hidden"
        >

          <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none ${isDangerous ? 'bg-red-500' : 'bg-primary'}`} />

          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${isDangerous ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
              <span className="material-symbols-outlined text-[24px]">
                {isDangerous ? 'warning' : 'help'}
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-on-surface mb-2">{title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-outline-variant/20">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isDangerous
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-red-500'
                  : 'bg-primary/10 text-primary hover:bg-primary hover:text-black border border-primary/20 hover:border-primary'
              }`}
            >
              {isLoading ? (confirmText.toLowerCase().includes('delete') ? 'Deleting...' : 'Confirming...') : confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmModal;
