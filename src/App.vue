<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { 
  Settings, 
  Languages, 
  FileText,
  Sun,
  Moon,
  Clock,
  Monitor,
  Check
} from 'lucide-vue-next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettingsStore, type ThemeMode } from './stores/settings';
import pkg from '../package.json';
import { cn } from './lib/utils';

// Import newly separated views
import TranslationView from './components/TranslationView.vue';
import ConversationView from './components/ConversationView.vue';
import SettingsView from './components/SettingsView.vue';
import LogsView from './components/LogsView.vue';
import HistoryView from './components/HistoryView.vue';

const settings = useSettingsStore();

const themeOptions = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const;
const themeMenuOpen = ref(false);
const systemIsDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);
const themeMode = computed(() => settings.themeMode);
const effectiveIsDark = computed(() => {
  if (settings.themeMode === 'system') return systemIsDark.value;
  return settings.themeMode === 'dark';
});
const systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
let unlistenSystemTheme: (() => void) | null = null;

watch(effectiveIsDark, (isDark) => {
  document.documentElement.classList.toggle('dark', isDark);
}, { immediate: true });

const selectTheme = (mode: ThemeMode) => {
  settings.themeMode = mode;
  themeMenuOpen.value = false;
};

const handleMediaThemeChange = (event: MediaQueryListEvent) => {
  systemIsDark.value = event.matches;
};

const handleGlobalClick = (event: MouseEvent) => {
  if (!(event.target as HTMLElement).closest('.theme-menu')) themeMenuOpen.value = false;
};

onMounted(async () => {
  systemThemeMedia.addEventListener('change', handleMediaThemeChange);
  window.addEventListener('click', handleGlobalClick);

  try {
    const appWindow = getCurrentWindow();
    const currentTheme = await appWindow.theme();
    if (currentTheme) systemIsDark.value = currentTheme === 'dark';
    unlistenSystemTheme = await appWindow.onThemeChanged(({ payload }) => {
      systemIsDark.value = payload === 'dark';
    });
  } catch {
    // Browser media query remains available as a fallback.
  }
});

onUnmounted(() => {
  systemThemeMedia.removeEventListener('change', handleMediaThemeChange);
  window.removeEventListener('click', handleGlobalClick);
  unlistenSystemTheme?.();
});

// Global Routing State
const view = ref<'translate' | 'conversation' | 'settings' | 'logs' | 'history'>('translate');

</script>

<template>
  <div class="h-screen bg-slate-100/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900 flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="h-14 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between px-6 shrink-0 sticky top-0 z-100 shadow-sm/5">
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
        <div class="relative theme-menu">
          <button
            @click.stop="themeMenuOpen = !themeMenuOpen"
            class="p-2 rounded-full transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="主题设置"
          >
            <Monitor v-if="themeMode === 'system'" class="w-5 h-5" />
            <Moon v-else-if="themeMode === 'dark'" class="w-5 h-5" />
            <Sun v-else class="w-5 h-5" />
          </button>
          <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="themeMenuOpen"
              class="absolute right-0 top-full mt-2 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 shadow-xl z-50"
            >
              <button
                v-for="option in themeOptions"
                :key="option.value"
                @click="selectTheme(option.value)"
                :class="cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  themeMode === option.value
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/60'
                )"
              >
                <component :is="option.icon" class="w-4 h-4" />
                <span>{{ option.label }}</span>
                <Check v-if="themeMode === option.value" class="w-4 h-4 ml-auto" />
              </button>
            </div>
          </transition>
        </div>
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
        v{{ pkg.version }}
      </div>
    </footer>
  </div>
</template>
