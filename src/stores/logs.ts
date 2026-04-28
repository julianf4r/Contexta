import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'error';
  content: any;
  curl?: string;
}

function createTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

export const useLogsStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([]);

  const addLog = (type: LogEntry['type'], content: any, curl?: string) => {
    logs.value.unshift({
      id: crypto.randomUUID(),
      timestamp: createTimestamp(),
      type,
      content,
      curl,
    });

    if (logs.value.length > 50) logs.value.pop();
  };

  const clearLogs = () => {
    logs.value = [];
  };

  return {
    logs,
    addLog,
    clearLogs,
  };
});
