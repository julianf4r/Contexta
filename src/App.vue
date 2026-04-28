<script setup lang="ts">
import { ref, watch } from 'vue';
import { 
  Settings, 
  Languages, 
  FileText,
  Sun,
  Moon,
  Clock
} from 'lucide-vue-next';
import { useSettingsStore } from './stores/settings';
import pkg from '../package.json';
import { cn } from './lib/utils';

// Import newly separated views
import TranslationView from './components/TranslationView.vue';
import ConversationView from './components/ConversationView.vue';
import SettingsView from './components/SettingsView.vue';
import LogsView from './components/LogsView.vue';
import HistoryView from './components/HistoryView.vue';

const settings = useSettingsStore();

// Theme management
watch(() => settings.isDark, (val) => {
  if (val) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}, { immediate: true });

const toggleTheme = () => {
  settings.isDark = !settings.isDark;
};

// Global Routing State
const view = ref<'translate' | 'conversation' | 'settings' | 'logs' | 'history'>('translate');

</script>

<template>
  <div class="h-screen bg-slate-100/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900 flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="h-14 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between px-6 shrink-0 sticky top-0 z-10 shadow-sm/5">
      <div class="flex items-center gap-2">
        <Languages class="w-6 h-6 text-blue-600" />
        <h1 class="font-semibold text-lg tracking-tight">译境</h1>
      </div>
      <nav class="flex items-center gap-1 rounded-full bg-slate-200/60 dark:bg-slate-800/70 p-1">
        <button 
          @click="view = 'translate'"
          :class="cn('px-4 py-1.5 rounded-full text-sm font-medium transition-colors', view === 'translate' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200')"
        >
          单轮翻译
        </button>
        <button 
          @click="view = 'conversation'"
          :class="cn('px-4 py-1.5 rounded-full text-sm font-medium transition-colors', view === 'conversation' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200')"
        >
          多轮翻译
        </button>
      </nav>
      <div class="flex items-center gap-2">
        <button 
          @click="toggleTheme"
          class="p-2 rounded-full transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          :title="settings.isDark ? '切换亮色主题' : '切换暗色主题'"
        >
          <Sun v-if="settings.isDark" class="w-5 h-5" />
          <Moon v-else class="w-5 h-5" />
        </button>
        <button 
          @click="view = 'settings'"
          :class="cn('p-2 rounded-full transition-colors', view === 'settings' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300')"
          title="设置"
        >
          <Settings class="w-5 h-5" />
        </button>
        <button 
          @click="view = 'logs'"
          :class="cn('p-2 rounded-full transition-colors', view === 'logs' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300')"
          title="日志"
        >
          <FileText class="w-5 h-5" />
        </button>
        <button 
          @click="view = 'history'"
          :class="cn('p-2 rounded-full transition-colors', view === 'history' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300')"
          title="历史记录"
        >
          <Clock class="w-5 h-5" />
        </button>
      </div>
    </header>

    <main class="flex-1 flex overflow-hidden min-h-0 relative">
      <!-- Container for isolated views with keep-alive -->
      <keep-alive>
        <TranslationView v-if="view === 'translate'" />
        <ConversationView v-else-if="view === 'conversation'" />
        <SettingsView v-else-if="view === 'settings'" />
        <LogsView v-else-if="view === 'logs'" />
        <HistoryView v-else-if="view === 'history'" />
      </keep-alive>
    </main>

    <!-- Footer -->
    <footer class="h-8 bg-slate-200/40 dark:bg-slate-900 border-t dark:border-slate-800 flex items-center px-4 justify-between shrink-0">
      <div class="text-[10px] text-slate-400 dark:text-slate-500">
        {{ settings.modelName }}
      </div>
      <div class="text-[10px] text-slate-400 dark:text-slate-500">
        Client v{{ pkg.version }}
      </div>
    </footer>
  </div>
</template>
