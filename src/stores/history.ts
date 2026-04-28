import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import type { HistoryItem } from '../domain/translation';

function formatTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

export const useHistoryStore = defineStore('history', () => {
  const history = useLocalStorage<HistoryItem[]>('translation-history-v1', []);

  const addHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const id = crypto.randomUUID();

    history.value.unshift({
      ...item,
      id,
      timestamp: formatTimestamp(),
    });

    if (history.value.length > 100) {
      history.value = history.value.slice(0, 100);
    }

    return id;
  };

  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    const index = history.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      history.value[index] = { ...history.value[index], ...updates };
    }
  };

  const deleteHistoryItem = (id: string) => {
    history.value = history.value.filter((item) => item.id !== id);
  };

  const clearHistory = () => {
    history.value = [];
  };

  return {
    history,
    addHistory,
    updateHistoryItem,
    deleteHistoryItem,
    clearHistory,
  };
});
