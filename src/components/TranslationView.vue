<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { ChevronDown, Check, ArrowRightLeft, Trash2, FileText, Plus, Loader2, Send, User, Type, Copy, Save } from 'lucide-vue-next';
import { listen } from '@tauri-apps/api/event';
import { LANGUAGES, SPEAKER_IDENTITY_OPTIONS, TONE_REGISTER_OPTIONS } from '../domain/translation';
import { useSettingsStore } from '../stores/settings';
import { useHistoryStore } from '../stores/history';
import { useLogsStore } from '../stores/logs';
import { useTranslationWorkspaceStore } from '../stores/translation-workspace';
import { cn } from '../lib/utils';
import { useClipboard } from '../composables/useClipboard';
import {
  buildSingleEvaluationSystemPrompt,
  buildSingleEvaluationUserPrompt,
  buildSingleRefinementSystemPrompt,
  buildSingleRefinementUserPrompt,
  buildSingleTranslationSystemPrompt,
  buildSingleTranslationUserPrompt,
} from '../lib/prompt-builders';
import {
  executeTranslationRequest,
  extractAssistantContent,
  resolveModelConfig,
  tryParseEvaluationResult,
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
  context,
  targetText,
  isTranslating,
  currentHistoryId,
  evaluationResult,
  isEvaluating,
  isRefining,
  selectedSuggestionIds,
  appliedSuggestionIds,
  activeStreamRequestId,
} = storeToRefs(workspaceStore);

const sourceDropdownOpen = ref(false);
const targetDropdownOpen = ref(false);
const speakerDropdownOpen = ref(false);
const toneDropdownOpen = ref(false);

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
    if ((isTranslating.value || isRefining.value) && event.payload.request_id === activeStreamRequestId.value) {
      targetText.value += event.payload.chunk;
    }
  });
});
onUnmounted(() => { if (unlisten) unlisten(); });

const sourceLangCode = computed({
  get: () => settings.sourceLang.code,
  set: (code) => { const lang = LANGUAGES.find(l => l.code === code); if (lang) settings.sourceLang = lang; }
});

const targetLangCode = computed({
  get: () => settings.targetLang.code,
  set: (code) => { const lang = LANGUAGES.find(l => l.code === code); if (lang) settings.targetLang = lang; }
});

const sourceLang = computed(() => settings.sourceLang);
const targetLang = computed(() => settings.targetLang);

const currentSpeakerLabel = computed(() => SPEAKER_IDENTITY_OPTIONS.find(opt => opt.value === settings.speakerIdentity)?.label || '男性');
const currentToneLabel = computed(() => TONE_REGISTER_OPTIONS.find(opt => opt.value === settings.toneRegister)?.label || '正式专业');

const swapLanguages = () => {
  const temp = { ...settings.sourceLang };
  settings.sourceLang = { ...settings.targetLang };
  settings.targetLang = temp;
};

const clearSource = () => {
  workspaceStore.clearWorkspace();
};

const toggleSuggestion = (id: number) => {
  workspaceStore.toggleSuggestion(id);
};

const evaluateTranslation = async () => {
  if (!targetText.value) return;
  isEvaluating.value = true;
  workspaceStore.resetEvaluationState();

  const modelConfig = resolveModelConfig({
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName,
  }, settings.profiles, settings.evaluationProfileId);

  const evaluationSystemPrompt = buildSingleEvaluationSystemPrompt(settings.evaluationPromptTemplate, {
    sourceLang: sourceLang.value,
    targetLang: targetLang.value,
    speakerIdentity: settings.speakerIdentity,
    toneRegister: settings.toneRegister,
    context: context.value,
  });

  const evaluationUserPrompt = buildSingleEvaluationUserPrompt(sourceText.value, targetText.value);

  const requestBody: TranslationPayload = {
    model: modelConfig.modelName,
    messages: [ { role: "system", content: evaluationSystemPrompt }, { role: "user", content: evaluationUserPrompt } ],
    stream: false
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: modelConfig.apiBaseUrl,
      apiKey: modelConfig.apiKey,
      payload: requestBody,
      logger: logsStore,
      logType: 'evaluation',
    });
    const parsedEvaluation = tryParseEvaluationResult(extractAssistantContent(response));
    if (!parsedEvaluation.ok) {
      console.error(parsedEvaluation.error, response);
      logsStore.addLog('error', `Evaluation parsing error: ${response}`);
    }
    evaluationResult.value = parsedEvaluation.result;
  } catch {
  } finally {
    isEvaluating.value = false;
  }
};

const refineTranslation = async () => {
  if (!targetText.value || isRefining.value) return;
  const selectedTexts = evaluationResult.value?.suggestions?.filter(s => selectedSuggestionIds.value?.includes(s.id)).map(s => s.text);
  if (!selectedTexts || selectedTexts.length === 0) return;

  isRefining.value = true;
  const originalTranslation = targetText.value;
  targetText.value = ''; 

  const modelConfig = resolveModelConfig({
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName,
  }, settings.profiles, settings.evaluationProfileId);

  const refinementSystemPrompt = buildSingleRefinementSystemPrompt(settings.refinementPromptTemplate, {
    sourceLang: sourceLang.value,
    targetLang: targetLang.value,
    speakerIdentity: settings.speakerIdentity,
    toneRegister: settings.toneRegister,
    context: context.value,
  });

  const refinementUserPrompt = buildSingleRefinementUserPrompt(sourceText.value, originalTranslation, selectedTexts);

  const requestBody: TranslationPayload = {
    model: modelConfig.modelName,
    messages: [ { role: "system", content: refinementSystemPrompt }, { role: "user", content: refinementUserPrompt } ],
    stream: settings.enableStreaming
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: modelConfig.apiBaseUrl,
      apiKey: modelConfig.apiKey,
      payload: requestBody,
      logger: logsStore,
      logType: 'refinement',
      onStreamStart: (requestId) => {
        activeStreamRequestId.value = requestId;
      },
    });
    
    if (!settings.enableStreaming) targetText.value = extractAssistantContent(response);
    
    if (evaluationResult.value?.suggestions) {
      appliedSuggestionIds.value.push(...selectedSuggestionIds.value);
      selectedSuggestionIds.value = [];
    }
    
    if (currentHistoryId.value) {
      historyStore.updateHistoryItem(currentHistoryId.value, {
        targetText: targetText.value
      });
    }
  } catch (err: any) {
    targetText.value = `Error: ${String(err)}`;
  } finally {
    isRefining.value = false;
    activeStreamRequestId.value = null;
  }
};

const translate = async () => {
  if (!sourceText.value.trim() || isTranslating.value) return;

  isTranslating.value = true;
  currentHistoryId.value = null;
  targetText.value = '';
  evaluationResult.value = null;

  const systemMessage = buildSingleTranslationSystemPrompt(settings.systemPromptTemplate, {
    sourceLang: sourceLang.value,
    targetLang: targetLang.value,
    speakerIdentity: settings.speakerIdentity,
    toneRegister: settings.toneRegister,
  });

  const userMessage = buildSingleTranslationUserPrompt(sourceText.value, context.value);

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
      finalTargetText = targetText.value;
    } else {
      finalTargetText = extractAssistantContent(response);
      targetText.value = finalTargetText;
    }

    currentHistoryId.value = historyStore.addHistory({
      sourceLang: { ...sourceLang.value },
      targetLang: { ...targetLang.value },
      sourceText: sourceText.value,
      targetText: finalTargetText,
      context: context.value,
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

  if (settings.enableEvaluation) await evaluateTranslation();
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
          
                    <!-- Context Input Area -->
                    <div class="px-6 py-3 bg-slate-200/20 dark:bg-slate-800/20 border-t border-dashed dark:border-slate-800 group/context relative">
                       <div class="flex items-center justify-between mb-1.5 h-5">
                          <div class="flex items-center gap-1.5">
                            <FileText class="w-4 h-4 text-slate-400" />
                            <span class="text-[12px] font-bold text-slate-400 uppercase tracking-widest">情景背景 (可选)</span>
                          </div>
                          <button 
                            v-if="context"
                            @click="context = ''"
                            class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded opacity-0 group-hover/context:opacity-100 transition-opacity"
                            title="清空背景"
                          >
                            <Plus class="w-3 h-3 rotate-45 text-slate-400" />
                          </button>
                       </div>
                       <textarea
                          v-model="context"
                          placeholder="在此输入背景信息，有助于提升翻译准确度..."
                          class="w-full bg-transparent border-none outline-none text-sm text-slate-500 dark:text-slate-400 resize-none h-14 leading-normal placeholder:italic placeholder:text-slate-300 dark:placeholder:text-slate-600"
                       ></textarea>
                    </div>
          
                    <div class="p-4 border-t dark:border-slate-800 bg-slate-50/30 dark:bg-transparent flex justify-end shrink-0">            <button 
              @click="translate"
              :disabled="isTranslating || isEvaluating || isRefining || !sourceText.trim()"
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
                title="说话人身份"
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

          <!-- Evaluation Results -->
          <div v-if="isEvaluating || evaluationResult" class="px-6 py-4 bg-slate-200/20 dark:bg-slate-800/20 border-t border-dashed dark:border-slate-800 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-y-auto max-h-80 shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div :class="cn(
                  'w-2 h-2 rounded-full',
                  isEvaluating ? 'bg-blue-400 animate-pulse' : (evaluationResult?.score && evaluationResult.score >= 80 ? 'bg-green-500' : evaluationResult?.score && evaluationResult.score >= 60 ? 'bg-amber-500' : 'bg-red-500')
                )"></div>
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">质量审计</h3>
              </div>
              <div v-if="evaluationResult" :class="cn(
                'text-lg font-black font-mono',
                evaluationResult.score >= 80 ? 'text-green-600' : evaluationResult.score >= 60 ? 'text-amber-600' : 'text-red-600'
              )">
                {{ evaluationResult.score }} <span class="text-[10px] font-normal opacity-50">/ 100</span>
              </div>
              <div v-else-if="isEvaluating" class="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
                <Loader2 class="w-3 h-3 animate-spin" />
                正在审计...
              </div>
            </div>

            <div v-if="evaluationResult" class="space-y-3">
              <div class="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800/60">
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {{ evaluationResult.analysis }}
                </p>
              </div>
              
              <div v-if="evaluationResult.suggestions && evaluationResult.suggestions.length > 0" class="space-y-4 pt-2">
                <!-- Pending Suggestions -->
                <div v-if="evaluationResult.suggestions.some(s => !appliedSuggestionIds.includes(s.id))" class="space-y-2">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">修改建议</h3>
                  </div>
                  <div class="space-y-2">
                    <div 
                      v-for="sug in evaluationResult.suggestions.filter(s => !appliedSuggestionIds.includes(s.id))" 
                      :key="sug.id"
                      @click="toggleSuggestion(sug.id)"
                      :class="cn(
                        'flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group',
                        selectedSuggestionIds?.includes(sug.id) 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                          : 'bg-white dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      )"
                    >
                      <div :class="cn(
                        'w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors',
                        selectedSuggestionIds?.includes(sug.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'
                      )">
                        <Check v-if="selectedSuggestionIds?.includes(sug.id)" class="w-3.5 h-3.5 text-white" stroke-width="4" />
                      </div>
                      <div class="flex-1 space-y-1.5 min-w-0">
                        <p class="text-xs text-slate-700 dark:text-slate-200 leading-normal">{{ sug.text }}</p>
                        <div class="flex items-center gap-2">
                          <div class="flex-1 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              class="h-full rounded-full transition-all duration-1000"
                              :class="sug.importance >= 80 ? 'bg-red-500' : sug.importance >= 40 ? 'bg-amber-500' : 'bg-blue-500'"
                              :style="{ width: `${sug.importance}%` }"
                            ></div>
                          </div>
                          <span class="text-[9px] font-bold opacity-40 uppercase tracking-tighter w-8 shrink-0">{{ sug.importance }}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Applied Suggestions -->
                <div v-if="appliedSuggestionIds.length > 0" class="space-y-2 border-t dark:border-slate-800 pt-4">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-slate-400"></div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">已润色</h3>
                  </div>
                  <div class="space-y-2">
                    <div 
                      v-for="sug in evaluationResult.suggestions.filter(s => appliedSuggestionIds.includes(s.id))" 
                      :key="'applied-' + sug.id"
                      class="p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/30 dark:bg-slate-800/20 opacity-70"
                    >
                      <p class="text-xs text-slate-500 dark:text-slate-400 leading-normal">{{ sug.text }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="p-4 border-t dark:border-slate-800 bg-slate-50/30 dark:bg-transparent flex justify-end gap-2 shrink-0">
            <button 
              @click="refineTranslation"
              v-if="evaluationResult && evaluationResult.suggestions && evaluationResult.suggestions.length > 0"
              :disabled="isRefining || isEvaluating || isTranslating || selectedSuggestionIds.length === 0"
              class="bg-blue-600 enabled:hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/40 text-white px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <Loader2 v-if="isRefining" class="w-4 h-4 animate-spin" />
              <Save v-else class="w-4 h-4" />
              {{ isRefining ? '正在润色...' : '润色' }}
            </button>
            <button 
              @click="evaluateTranslation"
              :disabled="isEvaluating || isTranslating || isRefining || !targetText.trim()"
              class="bg-blue-600 enabled:hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/40 text-white px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm"
            >
              <Loader2 v-if="isEvaluating" class="w-4 h-4 animate-spin" />
              <Check v-else class="w-4 h-4" />
              {{ isEvaluating ? '正在审计...' : '审计' }}
            </button>
          </div>
        </div>
      </div>
</template>
