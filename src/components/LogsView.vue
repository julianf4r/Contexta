<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { FileText, Check, Copy } from 'lucide-vue-next';
import { useLogsStore } from '../stores/logs';
import { cn } from '../lib/utils';
import { useClipboard } from '../composables/useClipboard';

const logsStore = useLogsStore();
const { activeCopyId, copyWithFeedback } = useClipboard();

const selectedLogId = ref<string | null>(null);
const selectedLogItem = computed(() => 
  logsStore.logs.find(l => l.id === selectedLogId.value) || null
);

watch(() => logsStore.logs, (newVal) => {
  if (newVal.length > 0 && !selectedLogId.value) {
    selectedLogId.value = newVal[0].id;
  }
}, { immediate: true });

const decodeUnicode = (str: string) => {
  if (!str) return str;
  try {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_match, grp) => {
      return String.fromCharCode(parseInt(grp, 16));
    });
  } catch {
    return str;
  }
};

const getLogSummary = (log: any) => {
  if (log.type === 'error') return String(log.content);
  if (typeof log.content === 'string') return decodeUnicode(log.content);
  if (log.content && log.content.model) return `Model: ${log.content.model}`;
  if (log.content && log.content.score) return `Score: ${log.content.score}`;
  return 'JSON Data';
};
</script>
<template>
<!-- Logs View -->
      <div  class="flex-1 flex overflow-hidden bg-slate-100/50 dark:bg-slate-950">
        <!-- Logs List (Master) -->
        <div class="w-80 md:w-96 border-r dark:border-slate-800 flex flex-col bg-white/60 dark:bg-slate-900/40">
          <div class="p-4 border-b dark:border-slate-800 space-y-3">
             <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">系统日志</h2>
              <button 
                @click="logsStore.clearLogs()" 
                class="text-[11px] text-red-500 hover:underline font-medium flex items-center gap-1"
              >
                清空全部
              </button>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            <div v-if="logsStore.logs.length === 0" class="py-20 text-center space-y-2">
              <FileText class="w-10 h-10 text-slate-200 dark:text-slate-800 mx-auto" />
              <p class="text-sm text-slate-400 italic">暂无日志记录</p>
            </div>
            <div
              v-for="log in logsStore.logs"
              :key="log.id"
              @click="selectedLogId = log.id"
              :class="cn(
                'w-full p-4 rounded-xl text-left transition-all border group relative cursor-pointer',
                selectedLogId === log.id 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/50 shadow-sm' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border-transparent'
              )"
            >
              <div class="flex items-center justify-between mb-2">
                <span 
                  :class="cn(
                    'px-2 py-0.5 rounded uppercase font-bold text-[10px]',
                    log.type === 'request' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    log.type === 'response' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  )"
                >{{ log.type === 'request' ? '请求' : log.type === 'response' ? '响应' : '错误' }}</span>
                <span class="text-[10px] text-slate-400 font-mono">{{ log.timestamp.split(' ')[1] }}</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 font-mono leading-relaxed">{{ getLogSummary(log) }}</p>
            </div>
          </div>
        </div>

        <!-- Log Detail (Detail) -->
        <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          <template v-if="selectedLogItem">
            <div class="p-6 border-b dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/20">
              <div class="flex items-center gap-3">
                <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">日志详情</h2>
                <span class="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{{ selectedLogItem.timestamp }}</span>
                <span 
                  :class="cn(
                    'px-2 py-0.5 rounded uppercase font-bold text-[10px]',
                    selectedLogItem.type === 'request' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    selectedLogItem.type === 'response' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  )"
                >{{ selectedLogItem.type === 'request' ? 'Request' : selectedLogItem.type === 'response' ? 'Response' : 'Error' }}</span>
              </div>
              <div class="flex gap-2">
                <button 
                  v-if="selectedLogItem.curl"
                  @click="copyWithFeedback(decodeUnicode(selectedLogItem.curl), `curl-${selectedLogItem.id}`)"
                  class="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors border border-blue-100 dark:border-blue-900/50"
                >
                  <Check v-if="activeCopyId === `curl-${selectedLogItem.id}`" class="w-4 h-4" />
                  <Copy v-else class="w-4 h-4" />
                  复制 cURL
                </button>
                <button 
                  @click="copyWithFeedback(decodeUnicode(typeof selectedLogItem.content === 'object' ? JSON.stringify(selectedLogItem.content, null, 2) : String(selectedLogItem.content)), `log-${selectedLogItem.id}`)"
                  class="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                  <Check v-if="activeCopyId === `log-${selectedLogItem.id}`" class="w-4 h-4 text-green-600" />
                  <Copy v-else class="w-4 h-4" />
                  复制内容
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-auto p-6 bg-slate-50/30 dark:bg-slate-900/50 custom-scrollbar space-y-6">
               <div v-if="selectedLogItem.curl" class="space-y-2">
                  <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">cURL 请求命令</h3>
                  <pre class="font-mono text-[11px] leading-relaxed p-4 bg-slate-950 text-blue-400 rounded-xl border border-slate-800 whitespace-pre-wrap break-all shadow-inner">{{ decodeUnicode(selectedLogItem.curl) }}</pre>
               </div>
               
               <div class="space-y-2">
                  <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{{ selectedLogItem.type === 'request' ? 'Payload (JSON)' : 'Response Data' }}</h3>
                  <pre class="font-mono text-[11px] leading-relaxed p-4 bg-slate-950 text-slate-300 rounded-xl border border-slate-800 whitespace-pre-wrap break-all shadow-inner">{{ decodeUnicode(typeof selectedLogItem.content === 'object' ? JSON.stringify(selectedLogItem.content, null, 2) : selectedLogItem.content) }}</pre>
               </div>
            </div>
          </template>
          <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-800 p-10 text-center space-y-4">
             <div class="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
                <FileText class="w-10 h-10 opacity-20" />
             </div>
             <p class="text-sm font-medium">请从左侧选择一条日志查看详情</p>
          </div>
        </div>
      </div>
</template>
