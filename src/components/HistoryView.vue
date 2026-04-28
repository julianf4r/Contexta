<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Clock, Search, ArrowRightLeft, Trash2, User, Type, Copy, Check, FileText } from 'lucide-vue-next';
import { useHistoryStore } from '../stores/history';
import { SPEAKER_IDENTITY_OPTIONS, TONE_REGISTER_OPTIONS } from '../domain/translation';
import { cn } from '../lib/utils';
import { useClipboard } from '../composables/useClipboard';

const historyStore = useHistoryStore();
const { activeCopyId, copyWithFeedback } = useClipboard();

const searchQuery = ref('');
const selectedHistoryId = ref<string | null>(null);

const filteredHistory = computed(() => {
  if (!searchQuery.value.trim()) return historyStore.history;
  const q = searchQuery.value.toLowerCase();
  return historyStore.history.filter(h => 
    h.sourceText.toLowerCase().includes(q) || 
    h.targetText.toLowerCase().includes(q)
  );
});

const selectedHistoryItem = computed(() => 
  historyStore.history.find(h => h.id === selectedHistoryId.value) || null
);

watch(filteredHistory, (newVal) => {
  if (newVal.length > 0 && !selectedHistoryId.value) {
    selectedHistoryId.value = newVal[0].id;
  }
}, { immediate: true });

const deleteHistoryItem = (id: string) => {
  historyStore.deleteHistoryItem(id);
  if (selectedHistoryId.value === id) {
    selectedHistoryId.value = filteredHistory.value[0]?.id || null;
  }
};
</script>
<template>
<!-- History View -->
      <div  class="flex-1 flex overflow-hidden bg-slate-100/50 dark:bg-slate-950">
        <!-- History List (Master) -->
        <div class="w-80 md:w-96 border-r dark:border-slate-800 flex flex-col bg-white/60 dark:bg-slate-900/40">
          <div class="p-4 border-b dark:border-slate-800 space-y-3">
            <div class="relative group">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                v-model="searchQuery"
                type="text"
                placeholder="搜索历史记录..."
                class="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all dark:text-slate-200"
              />
            </div>
            <div class="flex items-center justify-between px-1">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">共 {{ filteredHistory.length }} 条记录</span>
              <button 
                @click="historyStore.clearHistory()"
                class="text-[11px] text-red-500 hover:underline font-medium"
              >清空全部</button>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            <div v-if="filteredHistory.length === 0" class="py-20 text-center space-y-2">
              <Clock class="w-10 h-10 text-slate-200 dark:text-slate-800 mx-auto" />
              <p class="text-sm text-slate-400 italic">暂无相关历史</p>
            </div>
            <div
              v-for="item in filteredHistory"
              :key="item.id"
              @click="selectedHistoryId = item.id"
              :class="cn(
                'w-full p-4 rounded-xl text-left transition-all border group relative cursor-pointer',
                selectedHistoryId === item.id 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/50 shadow-sm' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border-transparent'
              )"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase">{{ item.sourceLang.code }}</span>
                  <ArrowRightLeft class="w-3 h-3 text-slate-300" />
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 uppercase">{{ item.targetLang.code }}</span>
                </div>
                <span class="text-[10px] text-slate-400 font-mono">{{ item.timestamp.split(' ')[1].substring(0, 5) }}</span>
              </div>
              <p class="text-xs text-slate-700 dark:text-slate-200 font-medium line-clamp-2 leading-relaxed mb-1">{{ item.sourceText }}</p>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1 italic">{{ item.targetText }}</p>
              
              <button 
                @click.stop="deleteHistoryItem(item.id)"
                class="absolute right-2 bottom-2 p-1.5 rounded-md text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                title="删除此记录"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- History Detail (Detail) -->
        <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          <template v-if="selectedHistoryItem">
            <div class="p-6 border-b dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/20">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-3">
                  <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">翻译详情</h2>
                  <span class="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{{ selectedHistoryItem.timestamp }}</span>
                </div>
                <div class="flex items-center gap-3 text-xs text-slate-500">
                  <div class="flex items-center gap-1">
                    <User class="w-3 h-3" />
                    {{ SPEAKER_IDENTITY_OPTIONS.find(o => o.value === (selectedHistoryItem?.speakerIdentity))?.label || selectedHistoryItem?.speakerIdentity }}
                  </div>
                  <span>•</span>
                  <div class="flex items-center gap-1">
                    <Type class="w-3 h-3" />
                    {{ TONE_REGISTER_OPTIONS.find(o => o.value === (selectedHistoryItem?.toneRegister))?.label || selectedHistoryItem?.toneRegister }}
                  </div>
                  <span>•</span>
                  <div class="font-mono text-[10px]">{{ selectedHistoryItem.modelName }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                 <button 
                    @click="deleteHistoryItem(selectedHistoryItem.id)"
                    class="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                    删除记录
                  </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              <!-- Source -->
              <section class="space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-1.5 h-4 bg-slate-300 dark:bg-slate-700 rounded-full"></div>
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest">{{ selectedHistoryItem.sourceLang.displayName }} (原文)</h3>
                  </div>
                  <button 
                    @click="copyWithFeedback(selectedHistoryItem.sourceText, `history-source-${selectedHistoryItem.id}`)"
                    class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                  >
                    <Check v-if="activeCopyId === `history-source-${selectedHistoryItem.id}`" class="w-4 h-4 text-green-600" />
                    <Copy v-else class="w-4 h-4" />
                  </button>
                </div>
                <div class="bg-slate-50 dark:bg-slate-800/30 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 text-lg leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                  {{ selectedHistoryItem.sourceText }}
                </div>
              </section>

              <!-- Context if exists -->
              <section v-if="selectedHistoryItem.context" class="space-y-4">
                 <div class="flex items-center gap-2">
                    <FileText class="w-4 h-4 text-slate-300" />
                    <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest">情景背景</h3>
                  </div>
                  <div class="bg-amber-50/30 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100/50 dark:border-amber-900/20 text-sm italic text-slate-500 dark:text-slate-400 leading-relaxed">
                    {{ selectedHistoryItem.context }}
                  </div>
              </section>

              <!-- Target -->
              <section class="space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                    <h3 class="text-xs font-black text-blue-500/60 uppercase tracking-widest">{{ selectedHistoryItem.targetLang.displayName }} (译文)</h3>
                  </div>
                  <button 
                    @click="copyWithFeedback(selectedHistoryItem.targetText, `history-target-${selectedHistoryItem.id}`)"
                    class="p-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                  >
                    <Check v-if="activeCopyId === `history-target-${selectedHistoryItem.id}`" class="w-4 h-4 text-green-600" />
                    <Copy v-else class="w-4 h-4" />
                  </button>
                </div>
                <div class="bg-blue-50/20 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100/50 dark:border-blue-900/20 text-xl leading-relaxed font-medium text-slate-800 dark:text-slate-100 whitespace-pre-wrap shadow-sm">
                  {{ selectedHistoryItem.targetText }}
                </div>
              </section>
            </div>
          </template>
          <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-800 p-10 text-center space-y-4">
             <div class="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
                <Clock class="w-10 h-10 opacity-20" />
             </div>
             <p class="text-sm font-medium">请从左侧选择一条历史记录查看详情</p>
          </div>
        </div>
      </div>
</template>
