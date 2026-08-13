<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { ChevronDown, Check, ArrowRightLeft, Trash2, Loader2, Send, User, Type, Copy, RefreshCcw, X } from 'lucide-vue-next';
import { listen } from '@tauri-apps/api/event';
import { LANGUAGES, SPEAKER_IDENTITY_OPTIONS, TONE_REGISTER_OPTIONS } from '../domain/translation';
import { useSettingsStore } from '../stores/settings';
import { useHistoryStore } from '../stores/history';
import { useLogsStore } from '../stores/logs';
import { useTranslationWorkspaceStore } from '../stores/translation-workspace';
import { cn } from '../lib/utils';
import { useClipboard } from '../composables/useClipboard';
import { executeBackTranslation, formatBackTranslationError, resolveBackTranslationTargetLanguage } from '../lib/back-translation-service';
import {
  buildSingleTranslationSystemPrompt,
  buildSingleTranslationUserPrompt,
} from '../lib/prompt-builders';
import {
  executeTranslationRequest,
  extractAssistantContent,
  extractStreamedAssistantContent,
  type TranslationChunkEvent,
  type TranslationPayload,
} from '../lib/translation-service';

const settings = useSettingsStore();
const historyStore = useHistoryStore();
const logsStore = useLogsStore();
const workspaceStore = useTranslationWorkspaceStore();
const { activeCopyId, copyWithFeedback } = useClipboard();
const {
  sourceText,
  targetText,
  backTranslationText,
  backTranslationLanguageCode,
  backTranslationError,
  isBackTranslating,
  isTranslating,
  activeStreamRequestId,
} = storeToRefs(workspaceStore);

const sourceDropdownOpen = ref(false);
const targetDropdownOpen = ref(false);
const speakerDropdownOpen = ref(false);
const toneDropdownOpen = ref(false);
let backTranslationRequestId = 0;

const clearBackTranslation = () => {
  backTranslationRequestId += 1;
  workspaceStore.resetBackTranslation();
};

const closeAllDropdowns = () => {
  sourceDropdownOpen.value = false;
  targetDropdownOpen.value = false;
  speakerDropdownOpen.value = false;
  toneDropdownOpen.value = false;
};

const toggleDropdown = (type: 'source' | 'target' | 'speaker' | 'tone') => {
  const states = {
    source: sourceDropdownOpen,
    target: targetDropdownOpen,
    speaker: speakerDropdownOpen,
    tone: toneDropdownOpen
  };
  const targetState = states[type];
  const currentValue = targetState.value;
  closeAllDropdowns();
  targetState.value = !currentValue;
};

const handleGlobalClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.lang-dropdown')) {
    closeAllDropdowns();
  }
};

onMounted(() => window.addEventListener('click', handleGlobalClick));
onUnmounted(() => window.removeEventListener('click', handleGlobalClick));

let unlisten: (() => void) | null = null;
onMounted(async () => {
  unlisten = await listen<TranslationChunkEvent>('translation-chunk', (event) => {
    if (isTranslating.value && event.payload.request_id === activeStreamRequestId.value) {
      targetText.value += event.payload.chunk;
    }
  });
});
onUnmounted(() => { if (unlisten) unlisten(); });

const sourceLangCode = computed({
  get: () => settings.sourceLang.code,
  set: (code) => { const lang = LANGUAGES.find(l => l.code === code); if (lang) { settings.sourceLang = lang; clearBackTranslation(); } }
});

const targetLangCode = computed({
  get: () => settings.targetLang.code,
  set: (code) => { const lang = LANGUAGES.find(l => l.code === code); if (lang) { settings.targetLang = lang; clearBackTranslation(); } }
});

const sourceLang = computed(() => settings.sourceLang);
const targetLang = computed(() => settings.targetLang);
const backTranslationTargetLanguage = computed(() =>
  resolveBackTranslationTargetLanguage(sourceLang.value, settings.backTranslationTargetLanguageCode)
);
const backTranslationLanguageLabel = computed(() =>
  LANGUAGES.find(language => language.code === backTranslationLanguageCode.value)?.displayName
    || backTranslationTargetLanguage.value.displayName
);

const currentSpeakerLabel = computed(() => SPEAKER_IDENTITY_OPTIONS.find(opt => opt.value === settings.speakerIdentity)?.label || '自动');
const currentToneLabel = computed(() => TONE_REGISTER_OPTIONS.find(opt => opt.value === settings.toneRegister)?.label || '正式专业');

const swapLanguages = () => {
  const temp = { ...settings.sourceLang };
  settings.sourceLang = { ...settings.targetLang };
  settings.targetLang = temp;
  clearBackTranslation();
};

const clearSource = () => {
  clearBackTranslation();
  workspaceStore.clearWorkspace();
};

const backTranslate = async () => {
  if (!targetText.value.trim() || isBackTranslating.value) return;

  const requestId = ++backTranslationRequestId;
  workspaceStore.resetBackTranslation();
  if (!settings.backTranslationApiKey.trim()) {
    backTranslationError.value = '请先在设置的“回译引擎”中配置 API Key。';
    return;
  }

  isBackTranslating.value = true;
  try {
    const targetLanguage = backTranslationTargetLanguage.value;
    const result = await executeBackTranslation({
      apiKey: settings.backTranslationApiKey,
      text: targetText.value,
      translatedLanguage: targetLang.value,
      targetLanguage,
      logger: logsStore,
    });
    if (requestId === backTranslationRequestId) {
      backTranslationText.value = result;
      backTranslationLanguageCode.value = targetLanguage.code;
    }
  } catch (error) {
    if (requestId === backTranslationRequestId) {
      backTranslationError.value = formatBackTranslationError(error);
    }
  } finally {
    if (requestId === backTranslationRequestId) isBackTranslating.value = false;
  }
};

const translate = async () => {
  if (!sourceText.value.trim() || isTranslating.value) return;

  isTranslating.value = true;
  clearBackTranslation();
  targetText.value = '';

  const systemMessage = buildSingleTranslationSystemPrompt(settings.systemPromptTemplate, {
    sourceLang: sourceLang.value,
    targetLang: targetLang.value,
    speakerIdentity: settings.speakerIdentity,
    toneRegister: settings.toneRegister,
  });

  const userMessage = buildSingleTranslationUserPrompt(sourceText.value);

  const requestBody: TranslationPayload = {
    model: settings.modelName,
    messages: [ { role: "system", content: systemMessage }, { role: "user", content: userMessage } ],
    stream: settings.enableStreaming
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      payload: requestBody,
      logger: logsStore,
      onStreamStart: (requestId) => {
        activeStreamRequestId.value = requestId;
      },
    });
    
    let finalTargetText = '';
    if (settings.enableStreaming) {
      finalTargetText = extractStreamedAssistantContent(response) || targetText.value;
      targetText.value = finalTargetText;
    } else {
      finalTargetText = extractAssistantContent(response);
      targetText.value = finalTargetText;
    }

    historyStore.addHistory({
      sourceLang: { ...sourceLang.value },
      targetLang: { ...targetLang.value },
      sourceText: sourceText.value,
      targetText: finalTargetText,
      speakerIdentity: settings.speakerIdentity,
      toneRegister: settings.toneRegister,
      modelName: settings.modelName
    });
  } catch (err: any) {
    targetText.value = `Error: ${String(err)}`;
  } finally {
    isTranslating.value = false;
    activeStreamRequestId.value = null;
  }
};
</script>
<template>
<!-- Translation View -->
      <div  class="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x dark:divide-slate-800 bg-white/50 dark:bg-slate-900 overflow-hidden h-full">
        <!-- Source Pane -->
        <div class="flex-1 flex flex-col min-h-0 relative h-full">
          <div class="flex items-center gap-3 px-6 py-3 border-b dark:border-slate-800 bg-slate-100/40 dark:bg-slate-800/30 relative z-40 shrink-0">
            <!-- Custom Source Dropdown -->
            <div class="relative lang-dropdown min-w-30">
              <button 
                @click.stop="toggleDropdown('source')"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors text-sm font-semibold text-slate-700 dark:text-slate-200 w-full justify-between group"
              >
                <span class="truncate">{{ sourceLang.displayName }}</span>
                <ChevronDown :class="cn('w-4 h-4 text-slate-400 transition-transform duration-200', sourceDropdownOpen && 'rotate-180')" />
              </button>
              
              <!-- Dropdown Menu -->
              <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
              >
                <div 
                  v-if="sourceDropdownOpen"
                  class="absolute left-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col custom-scrollbar"
                >
                  <button
                    v-for="lang in LANGUAGES"
                    :key="lang.code"
                    @click="sourceLangCode = lang.code; sourceDropdownOpen = false"
                    :class="cn(
                      'px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between',
                      sourceLangCode === lang.code ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )"
                  >
                    {{ lang.displayName }}
                    <Check v-if="sourceLangCode === lang.code" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </transition>
            </div>

            <button @click="swapLanguages" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors" title="交换语言">
              <ArrowRightLeft class="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
            <div class="ml-auto flex items-center gap-2">
               <button @click="clearSource" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors" title="清空内容">
                <Trash2 class="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          </div>
                      <textarea
                      v-model="sourceText"
                      placeholder="请输入待翻译内容..."
                      class="flex-1 p-6 resize-none outline-none text-lg leading-relaxed placeholder:text-slate-300 dark:placeholder:text-slate-600 bg-transparent min-h-0"
                    ></textarea>
          
                    <div class="p-4 border-t dark:border-slate-800 bg-slate-50/30 dark:bg-transparent flex justify-end shrink-0">            <button 
              @click="translate"
              :disabled="isTranslating || isBackTranslating || !sourceText.trim()"
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/40 text-white px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <Loader2 v-if="isTranslating" class="w-4 h-4 animate-spin" />
              <Send v-else class="w-4 h-4" />
              {{ isTranslating ? '正在翻译...' : '翻译' }}
            </button>
          </div>
        </div>
<!-- Target Pane -->
        <div class="flex-1 flex flex-col min-h-0 bg-slate-100/20 dark:bg-slate-900/50 relative h-full">
          <div class="flex items-center gap-3 px-6 py-3 border-b dark:border-slate-800 bg-slate-100/40 dark:bg-slate-800/30 relative z-40 shrink-0">
            <!-- Custom Target Dropdown -->
            <div class="relative lang-dropdown min-w-30">
              <button 
                @click.stop="toggleDropdown('target')"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors text-sm font-semibold text-slate-700 dark:text-slate-200 w-full justify-between"
              >
                <span class="truncate">{{ targetLang.displayName }}</span>
                <ChevronDown :class="cn('w-4 h-4 text-slate-400 transition-transform duration-200', targetDropdownOpen && 'rotate-180')" />
              </button>
              
              <!-- Dropdown Menu -->
              <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
              >
                <div 
                  v-if="targetDropdownOpen"
                  class="absolute left-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col custom-scrollbar"
                >
                  <button
                    v-for="lang in LANGUAGES"
                    :key="lang.code"
                    @click="targetLangCode = lang.code; targetDropdownOpen = false"
                    :class="cn(
                      'px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between',
                      targetLangCode === lang.code ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )"
                  >
                    {{ lang.displayName }}
                    <Check v-if="targetLangCode === lang.code" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </transition>
            </div>

            <!-- Speaker Identity Dropdown -->
            <div class="relative lang-dropdown min-w-24">
              <button 
                @click.stop="toggleDropdown('speaker')"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors text-sm font-medium text-slate-600 dark:text-slate-300 w-full justify-between group"
                title="说话者语法性别"
              >
                <div class="flex items-center gap-1.5 truncate">
                  <User class="w-3.5 h-3.5 text-slate-400" />
                  <span class="truncate">{{ currentSpeakerLabel }}</span>
                </div>
                <ChevronDown :class="cn('w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0', speakerDropdownOpen && 'rotate-180')" />
              </button>
              
              <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
              >
                <div 
                  v-if="speakerDropdownOpen"
                  class="absolute left-0 mt-2 w-40 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col custom-scrollbar"
                >
                  <button
                    v-for="opt in SPEAKER_IDENTITY_OPTIONS"
                    :key="opt.value"
                    @click="settings.speakerIdentity = opt.value; speakerDropdownOpen = false"
                    :class="cn(
                      'px-4 py-2 text-sm text-left transition-colors flex items-center justify-between',
                      settings.speakerIdentity === opt.value ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )"
                  >
                    {{ opt.label }}
                    <Check v-if="settings.speakerIdentity === opt.value" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </transition>
            </div>

            <!-- Tone & Register Dropdown -->
            <div class="relative lang-dropdown min-w-32">
              <button 
                @click.stop="toggleDropdown('tone')"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors text-sm font-medium text-slate-600 dark:text-slate-300 w-full justify-between group"
                title="语气风格"
              >
                <div class="flex items-center gap-1.5 truncate">
                  <Type class="w-3.5 h-3.5 text-slate-400" />
                  <span class="truncate">{{ currentToneLabel }}</span>
                </div>
                <ChevronDown :class="cn('w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0', toneDropdownOpen && 'rotate-180')" />
              </button>
              
              <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
              >
                <div 
                  v-if="toneDropdownOpen"
                  class="absolute left-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col custom-scrollbar"
                >
                  <button
                    v-for="opt in TONE_REGISTER_OPTIONS"
                    :key="opt.value"
                    @click="settings.toneRegister = opt.value; toneDropdownOpen = false"
                    :class="cn(
                      'px-4 py-2.5 text-sm text-left transition-colors flex flex-col gap-0.5',
                      settings.toneRegister === opt.value ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )"
                  >
                    <div class="flex items-center justify-between w-full">
                      {{ opt.label }}
                      <Check v-if="settings.toneRegister === opt.value" class="w-3.5 h-3.5" />
                    </div>
                    <span class="text-[10px] opacity-60 font-normal truncate">{{ opt.description }}</span>
                  </button>
                </div>
              </transition>
            </div>

            <div class="ml-auto flex items-center gap-2">
              <button @click="copyWithFeedback(targetText, 'main-target')" class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors relative" title="复制结果">
                <Check v-if="activeCopyId === 'main-target'" class="w-4 h-4 text-green-600" />
                <Copy v-else class="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          </div>
          <div class="flex-1 p-6 overflow-y-auto text-lg leading-relaxed whitespace-pre-wrap min-h-0">
            <template v-if="targetText">
              {{ targetText }}
            </template>
            <span v-else class="text-slate-300 dark:text-slate-600 italic">翻译结果将在此显示...</span>
          </div>

          <!-- Back Translation -->
          <div
            v-if="isBackTranslating || backTranslationText || backTranslationError"
            class="px-6 py-4 bg-cyan-50/60 dark:bg-cyan-950/20 border-t border-cyan-100 dark:border-cyan-900/40 shrink-0"
          >
            <div class="flex items-center justify-between gap-4 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <RefreshCcw class="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <h3 class="text-xs font-bold text-cyan-700 dark:text-cyan-300">回译 · {{ backTranslationLanguageLabel }}</h3>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  v-if="backTranslationText"
                  @click="copyWithFeedback(backTranslationText, 'main-back-translation')"
                  class="p-1.5 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded-md transition-colors"
                  title="复制回译"
                >
                  <Check v-if="activeCopyId === 'main-back-translation'" class="w-3.5 h-3.5 text-green-600" />
                  <Copy v-else class="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                </button>
                <button
                  @click="clearBackTranslation"
                  :disabled="isBackTranslating"
                  class="p-1.5 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded-md transition-colors disabled:opacity-30"
                  title="关闭回译"
                >
                  <X class="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                </button>
              </div>
            </div>
            <div v-if="isBackTranslating" class="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
              <Loader2 class="w-4 h-4 animate-spin" />
              正在回译...
            </div>
            <p v-else-if="backTranslationError" class="text-sm text-red-600 dark:text-red-400 leading-relaxed">{{ backTranslationError }}</p>
            <p v-else class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">{{ backTranslationText }}</p>
          </div>

          <div class="p-4 border-t dark:border-slate-800 bg-slate-50/30 dark:bg-transparent flex justify-end shrink-0">
            <button
              @click="backTranslate"
              :disabled="isBackTranslating || isTranslating || !targetText.trim()"
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/40 text-white px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <Loader2 v-if="isBackTranslating" class="w-4 h-4 animate-spin" />
              <RefreshCcw v-else class="w-4 h-4" />
              {{ isBackTranslating ? '正在回译...' : '回译' }}
            </button>
          </div>

        </div>
      </div>
</template>
