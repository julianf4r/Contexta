<script setup lang="ts">
import { ref, computed, nextTick, onActivated, onMounted, onUnmounted, watch } from 'vue';
import { 
  Plus, Search, Trash2, Send, User, Type, ChevronDown, Check, 
  MessageSquare, Loader2, Copy, 
  X, Sparkles, Languages, Venus, Mars, CircleSlash,
  ShieldCheck, RotateCcw
} from 'lucide-vue-next';
import { 
  useSettingsStore,
} from '../stores/settings';
import {
  LANGUAGES, 
  SPEAKER_IDENTITY_OPTIONS, 
  TONE_REGISTER_OPTIONS, 
  type Participant 
} from '../domain/translation';
import { useConversationStore } from '../stores/conversation';
import { useLogsStore } from '../stores/logs';
import { cn } from '../lib/utils';
import { listen } from '@tauri-apps/api/event';
import { useClipboard } from '../composables/useClipboard';
import {
  buildConversationEvaluationSystemPrompt,
  buildConversationEvaluationUserPrompt,
  buildConversationRefinementUserPrompt,
  buildConversationSystemPrompt,
  buildConversationTranslationUserPrompt,
} from '../lib/prompt-builders';
import {
  EVALUATION_RESPONSE_FORMAT,
  executeTranslationRequest,
  extractAssistantContent,
  resolveModelConfig,
  tryParseEvaluationResult,
  type TranslationChunkEvent,
  type TranslationPayload,
} from '../lib/translation-service';

const settings = useSettingsStore();
const conversationStore = useConversationStore();
const logsStore = useLogsStore();
const { activeCopyId, copyWithFeedback } = useClipboard();

// UI States
const searchQuery = ref('');
const isCreatingSession = ref(false);
const messageContainer = ref<HTMLElement | null>(null);

// New Session Form
const newSessionMe = ref<Participant>({
  name: '我',
  gender: 'Male',
  language: LANGUAGES[0],
  tone: TONE_REGISTER_OPTIONS[3].value // 礼貌随和
});
const newSessionPartner = ref<Participant>({
  name: '对方',
  gender: 'Female',
  language: LANGUAGES[4], // 西班牙语
  tone: 'Auto-detect'
});

// Audit Modal States
const isAuditModalOpen = ref(false);
const currentAuditMessageId = ref<string | null>(null);
const selectedSuggestionIds = ref<number[]>([]);

const activeAuditMessage = computed(() => {
  if (!activeSession.value || !currentAuditMessageId.value) return null;
  return activeSession.value.messages.find(m => m.id === currentAuditMessageId.value) || null;
});

// Custom Dropdown States for Modal
const meLangDropdownOpen = ref(false);
const meGenderDropdownOpen = ref(false);
const partnerLangDropdownOpen = ref(false);
const partnerGenderDropdownOpen = ref(false);

const closeAllModalDropdowns = () => {
  meLangDropdownOpen.value = false;
  meGenderDropdownOpen.value = false;
  partnerLangDropdownOpen.value = false;
  partnerGenderDropdownOpen.value = false;
};

// Current active session
const activeSession = computed(() => 
  conversationStore.chatSessions.find(s => s.id === conversationStore.activeSessionId) || null
);

const scrollToBottom = async (smooth = true) => {
  await nextTick();
  if (messageContainer.value) {
    messageContainer.value.scrollTo({
      top: messageContainer.value.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }
};

const restoreMessageScroll = async () => {
  if (!activeSession.value) return;
  await scrollToBottom(false);
  setTimeout(() => scrollToBottom(false), 100);
};

// Watch for session switch
watch(() => conversationStore.activeSessionId, async (newVal) => {
  if (newVal) {
    // 切换会话时，先立即滚动到底部（非平滑），然后再等 DOM 渲染完成后尝试平滑滚动确保到位
    await scrollToBottom(false);
    setTimeout(() => scrollToBottom(true), 100); 
  }
});

const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) return conversationStore.chatSessions;
  const q = searchQuery.value.toLowerCase();
  return conversationStore.chatSessions.filter(s => 
    s.title.toLowerCase().includes(q) || 
    s.partner.name.toLowerCase().includes(q)
  );
});

// Input States
const myInput = ref('');
const partnerInput = ref('');
const isTranslating = ref(false);
const currentStreamingMessageId = ref<string | null>(null);
const activeStreamRequestId = ref<string | null>(null);

// Dropdowns
const myToneDropdownOpen = ref(false);

// Methods
const handleCreateSession = () => {
  if (!newSessionPartner.value.name.trim()) return;
  const id = conversationStore.createSession({ ...newSessionMe.value }, { ...newSessionPartner.value });
  isCreatingSession.value = false;
  conversationStore.activeSessionId = id;
};

let unlisten: (() => void) | null = null;
onMounted(async () => {
  restoreMessageScroll();
  unlisten = await listen<TranslationChunkEvent>('translation-chunk', (event) => {
    if (
      activeSession.value &&
      currentStreamingMessageId.value &&
      event.payload.request_id === activeStreamRequestId.value
    ) {
      conversationStore.updateChatMessage(activeSession.value.id, currentStreamingMessageId.value, {
        translated: (activeSession.value.messages.find(m => m.id === currentStreamingMessageId.value)?.translated || '') + event.payload.chunk
      });
      
      // 优化：只有当正在流式输出的消息是最后一条时，才自动滚动到底部
      const lastMsg = activeSession.value.messages[activeSession.value.messages.length - 1];
      if (lastMsg && lastMsg.id === currentStreamingMessageId.value) {
        scrollToBottom();
      }
    }
  });
});
onActivated(() => {
  restoreMessageScroll();
});
onUnmounted(() => { if (unlisten) unlisten(); });

const translateMessage = async (sender: 'me' | 'partner', retranslateId?: string) => {
  if (!activeSession.value || isTranslating.value) return;
  
  let text = '';
  let messageId = '';

  if (retranslateId) {
    const msg = activeSession.value.messages.find(m => m.id === retranslateId);
    if (!msg) return;
    text = msg.original;
    messageId = retranslateId;
    conversationStore.updateChatMessage(activeSession.value.id, messageId, { translated: '', evaluation: undefined });
  } else {
    text = sender === 'me' ? myInput.value.trim() : partnerInput.value.trim();
    if (!text) return;
    
    const newId = conversationStore.addMessageToSession(activeSession.value.id, sender, text, '');
    if (!newId) return;
    messageId = newId;
    if (sender === 'me') myInput.value = ''; else partnerInput.value = '';
  }

  isTranslating.value = true;
  currentStreamingMessageId.value = messageId;
  
  // 只有新消息才自动滚动到底部，重新翻译不滚动
  if (!retranslateId) {
    await scrollToBottom();
  }

  // 2. Prepare Context
  const historyLimit = 10;
  const sessionMessages = activeSession.value.messages;
  // 重新翻译时，排除当前这条消息本身作为历史
  const recentMessages = sessionMessages.filter(m => m.id !== messageId).slice(-historyLimit);
  
  const historyBlock = recentMessages.map(m => {
    const senderName = m.sender === 'me' ? activeSession.value!.me.name : activeSession.value!.partner.name;
    return `${senderName}: "${m.original}"`;
  }).join('\n');

  // 3. Prepare Prompt
  const fromLang = sender === 'me' ? activeSession.value.me.language : activeSession.value.partner.language;
  const toLang = sender === 'me' ? activeSession.value.partner.language : activeSession.value.me.language;
  const targetTone = sender === 'me' 
    ? TONE_REGISTER_OPTIONS.find(o => o.value === activeSession.value!.me.tone)?.value || 'Polite & Conversational'
    : 'Auto-detect';
  const senderName = sender === 'me' ? activeSession.value.me.name : activeSession.value.partner.name;

  const systemPrompt = buildConversationSystemPrompt(settings.chatSystemPromptTemplate, {
    me: activeSession.value.me,
    partner: activeSession.value.partner,
    historyBlock,
    senderName,
    fromLang,
    toLang,
    targetTone,
  }, 'None (This is the start of conversation)');

  const requestBody: TranslationPayload = {
    model: settings.modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildConversationTranslationUserPrompt(text) }
    ],
    stream: settings.enableStreaming
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: settings.apiBaseUrl,
      apiKey: settings.apiKey,
      payload: requestBody,
      logger: logsStore,
      logType: retranslateId ? 'conversation-retranslate' : 'conversation',
      onStreamStart: (requestId) => {
        activeStreamRequestId.value = requestId;
      },
    });

    if (!settings.enableStreaming) {
      conversationStore.updateChatMessage(activeSession.value.id, messageId, { translated: extractAssistantContent(response) });
    }
  } catch (err: any) {
    conversationStore.updateChatMessage(activeSession.value.id, messageId, { translated: `Error: ${String(err)}` });
  } finally {
    isTranslating.value = false;
    currentStreamingMessageId.value = null;
    activeStreamRequestId.value = null;
    
    // 只有新消息才滚动到底部
    if (!retranslateId) {
      scrollToBottom();
    }
  }
};

const deleteMessage = (messageId: string) => {
  if (!activeSession.value) return;
  conversationStore.deleteChatMessage(activeSession.value.id, messageId);
};

const evaluateMessage = async (messageId: string, force = false) => {
  if (!activeSession.value) return;
  const msg = activeSession.value.messages.find(m => m.id === messageId);
  if (!msg) return;

  currentAuditMessageId.value = messageId;
  selectedSuggestionIds.value = [];
  
  await nextTick();
  isAuditModalOpen.value = true;

  if (!force && (msg.evaluation || msg.isEvaluating)) return;

  conversationStore.updateChatMessage(activeSession.value.id, messageId, { isEvaluating: true, evaluation: undefined });

  const historyLimit = 10;
  const recentMessages = activeSession.value.messages.filter(m => m.id !== messageId).slice(-historyLimit);
  // 净化历史：只提供原文流
  const historyBlock = recentMessages.map(m => {
    const senderName = m.sender === 'me' ? activeSession.value!.me.name : activeSession.value!.partner.name;
    return `${senderName}: "${m.original}"`;
  }).join('\n');

  // 动态确定语言方向
  const fromLang = msg.sender === 'me' ? activeSession.value.me.language : activeSession.value.partner.language;
  const toLang = msg.sender === 'me' ? activeSession.value.partner.language : activeSession.value.me.language;
  const senderName = msg.sender === 'me' ? activeSession.value.me.name : activeSession.value.partner.name;

  // 动态确定目标语气约束
  const targetTone = msg.sender === 'me' 
    ? (TONE_REGISTER_OPTIONS.find(o => o.value === activeSession.value!.me.tone)?.value || 'Polite & Conversational')
    : 'Auto-detect';

  const systemPrompt = buildConversationEvaluationSystemPrompt(settings.chatEvaluationPromptTemplate, {
    me: activeSession.value.me,
    partner: activeSession.value.partner,
    historyBlock,
    senderName,
    fromLang,
    toLang,
    targetTone,
  }, 'None');

  const userPrompt = buildConversationEvaluationUserPrompt(msg.original, msg.translated);

  const modelConfig = resolveModelConfig({
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName,
  }, settings.profiles, settings.evaluationProfileId);

  const requestBody: TranslationPayload = {
    model: modelConfig.modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    stream: false,
    response_format: EVALUATION_RESPONSE_FORMAT
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: modelConfig.apiBaseUrl,
      apiKey: modelConfig.apiKey,
      payload: requestBody,
      logger: logsStore,
      logType: 'conversation-eval',
    });
    conversationStore.updateChatMessage(activeSession.value.id, messageId, { evaluation: extractAssistantContent(response) });
  } catch {
  } finally {
    conversationStore.updateChatMessage(activeSession.value.id, messageId, { isEvaluating: false });
  }
};

const toggleSuggestion = (id: number) => {
  const index = selectedSuggestionIds.value.indexOf(id);
  if (index > -1) selectedSuggestionIds.value.splice(index, 1);
  else selectedSuggestionIds.value.push(id);
};

const refineMessage = async (messageId: string) => {
  if (!activeSession.value) return;
  const msg = activeSession.value.messages.find(m => m.id === messageId);
  if (!msg || !msg.evaluation || msg.isRefining) return;

  const parsedEvaluation = tryParseEvaluationResult(msg.evaluation);
  const evalData = parsedEvaluation.result;

  // 仅使用选中的建议
  const selectedSuggestions = evalData.suggestions.filter((s: any) => selectedSuggestionIds.value.includes(s.id));
  if (selectedSuggestions.length === 0) return;

  const currentTranslation = msg.translated;

  isAuditModalOpen.value = false; // 关闭弹窗开始润色
  conversationStore.updateChatMessage(activeSession.value.id, messageId, { isRefining: true, translated: '' });
  currentStreamingMessageId.value = messageId;

  const historyLimit = 10;
  const recentMessages = activeSession.value.messages.filter(m => m.id !== messageId).slice(-historyLimit);
  // 净化历史：只提供原文流
  const historyBlock = recentMessages.map(m => {
    const senderName = m.sender === 'me' ? activeSession.value!.me.name : activeSession.value!.partner.name;
    return `${senderName}: "${m.original}"`;
  }).join('\n');

  // 确定目标语气
  const targetTone = msg.sender === 'me' 
    ? TONE_REGISTER_OPTIONS.find(o => o.value === activeSession.value!.me.tone)?.value || 'Polite & Conversational' 
    : 'Auto-detect';
  
  // 动态确定语言方向
  const fromLang = msg.sender === 'me' ? activeSession.value.me.language : activeSession.value.partner.language;
  const toLang = msg.sender === 'me' ? activeSession.value.partner.language : activeSession.value.me.language;
  const senderName = msg.sender === 'me' ? activeSession.value.me.name : activeSession.value.partner.name;

  const systemPrompt = buildConversationSystemPrompt(settings.chatRefinementPromptTemplate, {
    me: activeSession.value.me,
    partner: activeSession.value.partner,
    historyBlock,
    senderName,
    fromLang,
    toLang,
    targetTone,
  }, 'None');

  const modelConfig = resolveModelConfig({
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName,
  }, settings.profiles, settings.evaluationProfileId);

  const requestBody: TranslationPayload = {
    model: modelConfig.modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildConversationRefinementUserPrompt(msg.original, currentTranslation, selectedSuggestions.map((s: any) => s.text)) }
    ],
    stream: settings.enableStreaming
  };

  try {
    const response = await executeTranslationRequest({
      apiAddress: modelConfig.apiBaseUrl,
      apiKey: modelConfig.apiKey,
      payload: requestBody,
      logger: logsStore,
      logType: 'conversation-refine',
      onStreamStart: (requestId) => {
        activeStreamRequestId.value = requestId;
      },
    });

    if (!settings.enableStreaming) {
      conversationStore.updateChatMessage(activeSession.value.id, messageId, { translated: extractAssistantContent(response) });
    }
  } catch {
  } finally {
    conversationStore.updateChatMessage(activeSession.value.id, messageId, { isRefining: false, evaluation: undefined });
    currentStreamingMessageId.value = null;
    activeStreamRequestId.value = null;
    
    // 只有当润色的是最后一条消息时才滚动到底部
    const lastMsg = activeSession.value.messages[activeSession.value.messages.length - 1];
    if (lastMsg && lastMsg.id === messageId) {
      scrollToBottom();
    }
  }
};

const parseEvaluation = (evalStr?: string) => tryParseEvaluationResult(evalStr).result;

const handleGlobalClick = () => {
  myToneDropdownOpen.value = false;
  closeAllModalDropdowns();
};

onMounted(() => window.addEventListener('click', handleGlobalClick));
onUnmounted(() => window.removeEventListener('click', handleGlobalClick));

</script>

<template>
  <div class="flex-1 flex overflow-hidden bg-slate-100/50 dark:bg-slate-950">
    <!-- Sessions Sidebar -->
    <div class="w-80 md:w-96 border-r dark:border-slate-800 flex flex-col bg-white/60 dark:bg-slate-900/40 shrink-0">
      <div class="p-4 border-b dark:border-slate-800 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">对话列表</h2>
          <button 
            @click="isCreatingSession = true"
            class="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-1 text-xs px-2.5"
          >
            <Plus class="w-3.5 h-3.5" />
            新建会话
          </button>
        </div>
        <div class="relative group">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="搜索会话..."
            class="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all dark:text-slate-200"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        <div v-if="filteredSessions.length === 0" class="py-20 text-center space-y-2">
          <MessageSquare class="w-10 h-10 text-slate-200 dark:text-slate-800 mx-auto" />
          <p class="text-sm text-slate-400 italic">暂无相关会话</p>
        </div>
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          @click="conversationStore.activeSessionId = session.id"
          :class="cn(
            'w-full p-4 rounded-xl text-left transition-all border group relative cursor-pointer',
            conversationStore.activeSessionId === session.id 
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/50 shadow-sm' 
              : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border-transparent'
          )"
        >
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                {{ session.partner.name.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{{ session.partner.name }}</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">{{ session.lastActivity.split(' ')[1].substring(0, 5) }}</span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 italic">
            {{ session.messages.length > 0 ? session.messages[session.messages.length - 1].translated : '开启新翻译对话...' }}
          </p>
          
          <button 
            @click.stop="conversationStore.deleteSession(session.id)"
            class="absolute right-2 bottom-2 p-1.5 rounded-md text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
            title="删除会话"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">
      <template v-if="activeSession">
        <!-- Chat Header -->
        <div class="h-16 border-b dark:border-slate-800 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10 shrink-0">
          <div class="flex items-center gap-3">
            <div class="flex -space-x-2">
              <div class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">我</div>
              <div class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                {{ activeSession.partner.name.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-bold dark:text-slate-200">{{ activeSession!.partner.name }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
             <div class="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] text-slate-500 font-medium">
                <Sparkles class="w-3 h-3 text-blue-500" />
                上下文模式已开启
             </div>
          </div>
        </div>

        <!-- Messages Flow -->
        <div 
          ref="messageContainer"
          class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-950"
        >
          <div v-if="activeSession.messages.length === 0" class="flex flex-col items-center justify-center h-full opacity-30 space-y-4">
             <MessageSquare class="w-16 h-16" />
             <p class="text-sm font-medium">开始你的第一句翻译吧</p>
          </div>

          <div 
            v-for="msg in activeSession.messages" 
            :key="msg.id"
            :class="cn('flex flex-col max-w-[85%]', msg.sender === 'me' ? 'ml-auto items-end' : 'mr-auto items-start')"
          >
            <!-- Sender Label (Optional) -->
            <div class="flex items-center gap-2 mb-1 px-1">
              <span class="text-[10px] font-bold text-slate-400 uppercase">{{ msg.sender === 'me' ? '我' : activeSession.partner.name }}</span>
              <span class="text-[9px] text-slate-300 font-mono">{{ msg.timestamp.split(' ')[1].substring(0, 5) }}</span>
            </div>

            <!-- Bubble -->
            <div 
              :class="cn(
                'rounded-2xl px-4 py-3 shadow-sm border transition-all group relative',
                msg.sender === 'me' 
                  ? 'bg-blue-600 dark:bg-blue-700 border-blue-500/50 dark:border-blue-800 rounded-tr-none' 
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-tl-none'
              )"
            >
              <!-- Original Text -->
              <p :class="cn('text-[13px] mb-2 leading-snug', msg.sender === 'me' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400')">
                {{ msg.original }}
              </p>
              
              <!-- Translated Text -->
              <div class="relative min-h-6">
                <p :class="cn('text-base font-medium leading-relaxed', msg.sender === 'me' ? 'text-white' : 'text-slate-800 dark:text-slate-100')">
                  {{ msg.translated }}
                  <span v-if="isTranslating && currentStreamingMessageId === msg.id" class="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-middle"></span>
                </p>
              </div>

              <!-- Action Tools (Copy, Evaluate, Refine) -->
              <div :class="cn(
                'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg border dark:border-slate-700 px-1 py-1 z-20',
                msg.sender === 'me' ? '-left-32' : '-right-32'
              )">
                <button 
                  @click="copyWithFeedback(msg.translated, msg.id)"
                  class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  title="复制译文"
                >
                  <Check v-if="activeCopyId === msg.id" class="w-3.5 h-3.5 text-green-600" />
                  <Copy v-else class="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button 
                  @click="translateMessage(msg.sender, msg.id)"
                  :disabled="isTranslating || msg.isEvaluating || msg.isRefining"
                  class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors disabled:opacity-30"
                  title="重新翻译"
                >
                  <RotateCcw v-if="isTranslating && currentStreamingMessageId === msg.id" class="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <RotateCcw v-else class="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button 
                  @click="evaluateMessage(msg.id)"
                  :disabled="msg.isEvaluating || msg.isRefining"
                  class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors disabled:opacity-30"
                  title="审计翻译"
                >
                  <Loader2 v-if="msg.isEvaluating" class="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <ShieldCheck v-else class="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button 
                  @click="deleteMessage(msg.id)"
                  class="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors group/del"
                  title="删除消息"
                >
                  <Trash2 class="w-3.5 h-3.5 text-slate-400 group-hover/del:text-red-500" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Inputs Area -->
        <div class="p-6 border-t dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0">
          <div class="grid grid-cols-2 gap-6">
            <!-- Partner Input (Left) -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between px-1 h-7">
                <div class="flex items-center gap-1">
                  <!-- Name Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <User class="w-3 h-3" />
                    {{ activeSession!.partner.name }}
                  </div>
                  <!-- Gender Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <Venus v-if="activeSession!.partner.gender === 'Female'" class="w-3 h-3 text-pink-500" />
                    <Mars v-else-if="activeSession!.partner.gender === 'Male'" class="w-3 h-3 text-blue-500" />
                    <CircleSlash v-else class="w-3 h-3 text-slate-400" />
                    {{ SPEAKER_IDENTITY_OPTIONS.find(o => o.value === activeSession!.partner.gender)?.label }}
                  </div>
                  <!-- Language Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <Languages class="w-3 h-3 text-emerald-500" />
                    {{ activeSession!.partner.language.displayName }}
                  </div>
                </div>
                <div class="text-[10px] text-slate-400 italic flex items-center h-full">自动识别语气</div>
              </div>
              <div class="relative group">
                <textarea 
                  v-model="partnerInput"
                  @keydown.enter.exact.prevent="translateMessage('partner')"
                  placeholder="粘贴对方说的话..."
                  class="w-full h-24 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm resize-none dark:text-slate-200"
                ></textarea>
                <button 
                  @click="translateMessage('partner')"
                  :disabled="isTranslating || !partnerInput.trim()"
                  class="absolute right-3 bottom-3 p-2 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-all disabled:opacity-30 shadow-sm"
                >
                  <Loader2 v-if="isTranslating && currentStreamingMessageId" class="w-4 h-4 animate-spin" />
                  <Send v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- My Input (Right) -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between px-1 h-7">
                <div class="flex items-center gap-1">
                  <!-- Name Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <User class="w-3 h-3" />
                    {{ activeSession!.me.name }}
                  </div>
                  <!-- Gender Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <Venus v-if="activeSession!.me.gender === 'Female'" class="w-3 h-3 text-pink-500" />
                    <Mars v-else-if="activeSession!.me.gender === 'Male'" class="w-3 h-3 text-blue-500" />
                    <CircleSlash v-else class="w-3 h-3 text-slate-400" />
                    {{ SPEAKER_IDENTITY_OPTIONS.find(o => o.value === activeSession!.me.gender)?.label }}
                  </div>
                  <!-- Language Badge -->
                  <div class="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <Languages class="w-3 h-3 text-emerald-500" />
                    {{ activeSession!.me.language.displayName }}
                  </div>
                </div>
                
                <!-- My Tone Selector -->
                <div class="relative flex items-center h-full">
                  <button 
                    @click.stop="myToneDropdownOpen = !myToneDropdownOpen"
                    class="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
                  >
                    <Type class="w-3 h-3" />
                    语气: {{ TONE_REGISTER_OPTIONS.find(o => o.value === activeSession?.me.tone)?.label || '随和' }}
                    <ChevronDown class="w-2.5 h-2.5" />
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
                      v-if="myToneDropdownOpen"
                      class="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col max-h-60 overflow-y-auto custom-scrollbar"
                    >
                      <button
                        v-for="opt in TONE_REGISTER_OPTIONS"
                        :key="opt.value"
                        @click="activeSession!.me.tone = opt.value; myToneDropdownOpen = false"
                        :class="cn(
                          'px-4 py-2 text-xs text-left transition-colors flex items-center justify-between',
                          activeSession!.me.tone === opt.value ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        )"
                      >
                        {{ opt.label }}
                        <Check v-if="activeSession!.me.tone === opt.value" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </transition>
                </div>
              </div>
              <div class="relative group">
                <textarea 
                  v-model="myInput"
                  @keydown.enter.exact.prevent="translateMessage('me')"
                  placeholder="输入你想说的话..."
                  class="w-full h-24 p-4 rounded-xl bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm resize-none dark:text-slate-200"
                ></textarea>
                <button 
                  @click="translateMessage('me')"
                  :disabled="isTranslating || !myInput.trim()"
                  class="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-30 shadow-md"
                >
                  <Loader2 v-if="isTranslating && currentStreamingMessageId" class="w-4 h-4 animate-spin" />
                  <Send v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- No Active Session Placeholder -->
      <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-800 p-10 text-center space-y-6">
        <div class="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
          <MessageSquare class="w-12 h-12 opacity-20" />
        </div>
        <div class="space-y-2">
          <h3 class="text-lg font-bold text-slate-400 dark:text-slate-600">选择或创建一个对话</h3>
          <p class="text-sm">在左侧侧边栏管理你的翻译会话</p>
        </div>
        <button 
          @click="isCreatingSession = true"
          class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg"
        >
          <Plus class="w-5 h-5" />
          开启新对话
        </button>
      </div>

      <!-- New Session Modal -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div v-if="isCreatingSession" class="absolute inset-0 z-100 flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm">
          <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border dark:border-slate-800">
            <div class="p-6 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950 rounded-t-3xl">
              <h3 class="text-lg font-bold dark:text-slate-100 flex items-center gap-2">
                <Plus class="w-5 h-5 text-blue-500" />
                创建新会话
              </h3>
              <button @click="isCreatingSession = false" class="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X class="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div class="p-8 space-y-8">
              <!-- Me Config -->
              <section class="space-y-4">
                <h4 class="text-xs font-black text-blue-500 uppercase tracking-widest">我的身份设定</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">姓名</label>
                    <input v-model="newSessionMe.name" type="text" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm dark:text-slate-200" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">使用语言</label>
                    <div class="relative">
                      <button 
                        @click.stop="closeAllModalDropdowns(); meLangDropdownOpen = !meLangDropdownOpen"
                        class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl text-sm dark:text-slate-200"
                      >
                        {{ newSessionMe.language.displayName }}
                        <ChevronDown class="w-4 h-4 text-slate-400" />
                      </button>
                      <div v-if="meLangDropdownOpen" class="absolute left-0 top-full mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl z-110 py-2 custom-scrollbar">
                        <button v-for="lang in LANGUAGES" :key="lang.code" @click="newSessionMe.language = lang; meLangDropdownOpen = false" class="w-full px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between">
                          {{ lang.displayName }}
                          <Check v-if="newSessionMe.language.code === lang.code" class="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">性别</label>
                    <div class="relative">
                      <button 
                        @click.stop="closeAllModalDropdowns(); meGenderDropdownOpen = !meGenderDropdownOpen"
                        class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl text-sm dark:text-slate-200"
                      >
                        {{ SPEAKER_IDENTITY_OPTIONS.find(o => o.value === newSessionMe.gender)?.label }}
                        <ChevronDown class="w-4 h-4 text-slate-400" />
                      </button>
                      <div v-if="meGenderDropdownOpen" class="absolute left-0 top-full mt-1 w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl z-110 py-2">
                        <button v-for="opt in SPEAKER_IDENTITY_OPTIONS" :key="opt.value" @click="newSessionMe.gender = opt.value; meGenderDropdownOpen = false" class="w-full px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between">
                          {{ opt.label }}
                          <Check v-if="newSessionMe.gender === opt.value" class="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Partner Config -->
              <section class="space-y-4">
                <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">对方身份设定</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">姓名</label>
                    <input v-model="newSessionPartner.name" type="text" placeholder="姓名" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm dark:text-slate-200" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">使用语言</label>
                    <div class="relative">
                      <button 
                        @click.stop="closeAllModalDropdowns(); partnerLangDropdownOpen = !partnerLangDropdownOpen"
                        class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl text-sm dark:text-slate-200"
                      >
                        {{ newSessionPartner.language.displayName }}
                        <ChevronDown class="w-4 h-4 text-slate-400" />
                      </button>
                      <div v-if="partnerLangDropdownOpen" class="absolute left-0 top-full mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl z-110 py-2 custom-scrollbar">
                        <button v-for="lang in LANGUAGES" :key="lang.code" @click="newSessionPartner.language = lang; partnerLangDropdownOpen = false" class="w-full px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between">
                          {{ lang.displayName }}
                          <Check v-if="newSessionPartner.language.code === lang.code" class="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                   <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">性别</label>
                    <div class="relative">
                      <button 
                        @click.stop="closeAllModalDropdowns(); partnerGenderDropdownOpen = !partnerGenderDropdownOpen"
                        class="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-xl text-sm dark:text-slate-200"
                      >
                        {{ SPEAKER_IDENTITY_OPTIONS.find(o => o.value === newSessionPartner.gender)?.label }}
                        <ChevronDown class="w-4 h-4 text-slate-400" />
                      </button>
                      <div v-if="partnerGenderDropdownOpen" class="absolute left-0 top-full mt-1 w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl z-110 py-2">
                        <button v-for="opt in SPEAKER_IDENTITY_OPTIONS" :key="opt.value" @click="newSessionPartner.gender = opt.value; partnerGenderDropdownOpen = false" class="w-full px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between">
                          {{ opt.label }}
                          <Check v-if="newSessionPartner.gender === opt.value" class="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <button 
                @click="handleCreateSession"
                :disabled="!newSessionPartner.name.trim()"
                class="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                开始会话
              </button>
            </div>
          </div>
        </div>
      </transition>

    </div>

    <!-- Audit Modal -->
    <transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="isAuditModalOpen && activeAuditMessage" class="fixed inset-0 z-999 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
        <div class="w-full max-w-xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
          <!-- Header -->
          <div class="px-8 py-6 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                <ShieldCheck class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-lg font-bold dark:text-slate-100">翻译质量审计</h3>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Quality Audit & Refinement</p>
              </div>
            </div>
            <button @click="isAuditModalOpen = false" class="p-2.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X class="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            <!-- Score & Analysis -->
            <section class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div :class="cn(
                    'w-2 h-2 rounded-full',
                    activeAuditMessage.isEvaluating ? 'bg-blue-400 animate-pulse' : (parseEvaluation(activeAuditMessage.evaluation)?.score >= 80 ? 'bg-green-500' : 'bg-red-500')
                  )"></div>
                  <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">总体评价</h4>
                </div>
                <div v-if="activeAuditMessage.evaluation" :class="cn(
                  'text-3xl font-black font-mono leading-none',
                  parseEvaluation(activeAuditMessage.evaluation).score >= 80 ? 'text-green-600' : 'text-red-600'
                )">
                  {{ parseEvaluation(activeAuditMessage.evaluation).score }}<span class="text-sm font-normal opacity-30 ml-1">/ 100</span>
                </div>
              </div>

              <div v-if="activeAuditMessage.isEvaluating" class="py-10 flex flex-col items-center justify-center space-y-4">
                <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
                <p class="text-sm text-slate-400 font-medium animate-pulse">正在深度分析译文...</p>
              </div>

              <div v-else-if="activeAuditMessage.evaluation" class="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic">
                  "{{ parseEvaluation(activeAuditMessage.evaluation).analysis }}"
                </p>
              </div>
            </section>

            <!-- Suggestions -->
            <section v-if="parseEvaluation(activeAuditMessage.evaluation)?.suggestions?.length" class="space-y-4">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">修改建议 (点击勾选)</h4>
              </div>
              
              <div class="space-y-3">
                <div 
                  v-for="sug in parseEvaluation(activeAuditMessage.evaluation).suggestions" 
                  :key="sug.id"
                  @click="toggleSuggestion(sug.id)"
                  :class="cn(
                    'flex items-start gap-4 p-4 rounded-2xl border transition-all cursor-pointer group',
                    selectedSuggestionIds.includes(sug.id) 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-2 ring-blue-500/10' 
                      : 'bg-white dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  )"
                >
                  <div :class="cn(
                    'w-5 h-5 rounded-lg border mt-0.5 shrink-0 flex items-center justify-center transition-all',
                    selectedSuggestionIds.includes(sug.id) ? 'bg-blue-600 border-blue-600 scale-110' : 'border-slate-300 dark:border-slate-600'
                  )">
                    <Check v-if="selectedSuggestionIds.includes(sug.id)" class="w-3.5 h-3.5 text-white" stroke-width="4" />
                  </div>
                  
                  <div class="flex-1 space-y-2.5 min-w-0">
                    <p class="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-normal">{{ sug.text }}</p>
                    
                    <!-- Importance Bar -->
                    <div class="flex items-center gap-3">
                      <div class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                        <div 
                          class="h-full rounded-full transition-all duration-1000 ease-out"
                          :class="sug.importance >= 80 ? 'bg-red-500' : sug.importance >= 40 ? 'bg-amber-500' : 'bg-blue-500'"
                          :style="{ width: `${sug.importance}%` }"
                        ></div>
                      </div>
                      <span class="text-[10px] font-black opacity-30 font-mono w-8 shrink-0">{{ sug.importance }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- Footer Action -->
          <div class="p-8 border-t dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center gap-4 shrink-0">
            <button 
              v-if="activeAuditMessage.evaluation && !activeAuditMessage.isEvaluating"
              @click="evaluateMessage(activeAuditMessage.id, true)"
              class="p-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl font-bold transition-all shrink-0"
              title="重新审计"
            >
              <RotateCcw class="w-5 h-5" />
            </button>

            <button 
              @click="isAuditModalOpen = false"
              class="flex-1 py-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all"
            >
              取消
            </button>
            <button 
              @click="refineMessage(activeAuditMessage.id)"
              :disabled="activeAuditMessage.isRefining || activeAuditMessage.isEvaluating || selectedSuggestionIds.length === 0"
              class="flex-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              <Loader2 v-if="activeAuditMessage.isRefining" class="w-5 h-5 animate-spin" />
              <Sparkles v-else class="w-5 h-5" />
              {{ activeAuditMessage.isRefining ? '正在润色...' : '应用选中建议并润色' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.4);
}
</style>
