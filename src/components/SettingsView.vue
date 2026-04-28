<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Play, Settings, Type, Save, Check, Plus, Trash2, ChevronDown, Eye, EyeOff, Pencil, MessageSquare } from 'lucide-vue-next';
import { 
  useSettingsStore, 
  DEFAULT_TEMPLATE, 
  DEFAULT_EVALUATION_TEMPLATE, 
  DEFAULT_REFINEMENT_TEMPLATE, 
  CONVERSATION_SYSTEM_PROMPT_TEMPLATE,
  CONVERSATION_EVALUATION_PROMPT_TEMPLATE,
  CONVERSATION_REFINEMENT_PROMPT_TEMPLATE
} from '../stores/settings';
import type { ApiProfile } from '../domain/translation';
import { cn } from '../lib/utils';

const settings = useSettingsStore();
const settingsCategory = ref<'api' | 'general' | 'prompts' | 'chat-prompts'>('api');
const showApiKey = ref(false);

const newProfileName = ref('');
const isSavingProfile = ref(false);

const saveCurrentAsProfile = () => {
  if (!newProfileName.value.trim()) return;
  const newProfile: ApiProfile = {
    id: crypto.randomUUID(),
    name: newProfileName.value.trim(),
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    modelName: settings.modelName
  };
  settings.profiles.push(newProfile);
  newProfileName.value = '';
  isSavingProfile.value = false;
};

const applyProfile = (p: ApiProfile) => {
  settings.apiBaseUrl = p.apiBaseUrl;
  settings.apiKey = p.apiKey;
  settings.modelName = p.modelName;
};

const deleteProfile = (id: string) => {
  settings.profiles = settings.profiles.filter(p => p.id !== id);
};

const editingProfileId = ref<string | null>(null);
const editProfileForm = ref<ApiProfile | null>(null);
const showEditApiKey = ref(false);

const startEditProfile = (profile: ApiProfile) => {
  editingProfileId.value = profile.id;
  editProfileForm.value = { ...profile };
  showEditApiKey.value = false;
};

const cancelEditProfile = () => {
  editingProfileId.value = null;
  editProfileForm.value = null;
};

const saveEditProfile = () => {
  if (!editProfileForm.value || !editingProfileId.value) return;
  if (!editProfileForm.value.name.trim()) return;
  
  const index = settings.profiles.findIndex(p => p.id === editingProfileId.value);
  if (index !== -1) {
    settings.profiles[index] = { ...editProfileForm.value };
  }
  
  editingProfileId.value = null;
  editProfileForm.value = null;
};

const evaluationProfileDropdownOpen = ref(false);
const toggleDropdown = (type: string) => {
  if (type === 'evaluationProfile') evaluationProfileDropdownOpen.value = !evaluationProfileDropdownOpen.value;
};

const currentEvaluationProfileLabel = computed(() => {
  if (!settings.evaluationProfileId) return '使用主翻译配置（默认）';
  const profile = settings.profiles.find(p => p.id === settings.evaluationProfileId);
  return profile ? `${profile.name} — ${profile.modelName}` : '使用主翻译配置（默认）';
});

const handleGlobalClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.lang-dropdown')) {
    evaluationProfileDropdownOpen.value = false;
  }
};

onMounted(() => window.addEventListener('click', handleGlobalClick));
onUnmounted(() => window.removeEventListener('click', handleGlobalClick));
</script>
<template>
<!-- Settings View -->
      <div  class="flex-1 flex overflow-hidden bg-slate-100/50 dark:bg-slate-950">
        <!-- Settings Sidebar (Master) -->
        <div class="w-64 border-r dark:border-slate-800 flex flex-col bg-white/60 dark:bg-slate-900/40">
          <div class="p-4 border-b dark:border-slate-800 shrink-0">
             <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">系统设置</h2>
          </div>
          <nav class="flex-1 overflow-y-auto p-3 space-y-1">
            <button 
              @click="settingsCategory = 'api'"
              :class="cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                settingsCategory === 'api' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50'
              )"
            >
              <div :class="cn('p-1.5 rounded-md', settingsCategory === 'api' ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800')">
                <Play class="w-4 h-4" />
              </div>
              API 与模型
            </button>
            <button 
              @click="settingsCategory = 'general'"
              :class="cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                settingsCategory === 'general' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50'
              )"
            >
              <div :class="cn('p-1.5 rounded-md', settingsCategory === 'general' ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800')">
                <Settings class="w-4 h-4" />
              </div>
              常规设置
            </button>
            <button 
              @click="settingsCategory = 'prompts'"
              :class="cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                settingsCategory === 'prompts' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50'
              )"
            >
              <div :class="cn('p-1.5 rounded-md', settingsCategory === 'prompts' ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800')">
                <Type class="w-4 h-4" />
              </div>
              提示词工程
            </button>
            <button 
              @click="settingsCategory = 'chat-prompts'"
              :class="cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                settingsCategory === 'chat-prompts' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50'
              )"
            >
              <div :class="cn('p-1.5 rounded-md', settingsCategory === 'chat-prompts' ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800')">
                <MessageSquare class="w-4 h-4" />
              </div>
              对话提示词
            </button>
          </nav>
        </div>

        <!-- Settings Content (Detail) -->
        <div class="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar bg-slate-50/30 dark:bg-transparent">
          <div class="max-w-3xl mx-auto space-y-8 pb-20">
            
            <!-- API & Models -->
            <template v-if="settingsCategory === 'api'">
              <div class="mb-6 border-b dark:border-slate-800 pb-4">
                <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">API 与模型</h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">配置与大语言模型通信的接口地址和凭证。</p>
              </div>

              <section>
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">当前接口配置</h2>
                  <div v-if="!isSavingProfile" class="flex items-center gap-2">
                     <button 
                      @click="isSavingProfile = true"
                      class="text-xs flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded"
                    >
                      <Save class="w-3.5 h-3.5" />
                      保存为预设
                    </button>
                  </div>
                  <div v-else class="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-lg border dark:border-slate-700 shadow-sm animate-in fade-in zoom-in duration-200">
                    <input 
                      v-model="newProfileName"
                      type="text"
                      placeholder="输入预设名称..."
                      class="text-xs px-2 py-1 bg-transparent outline-none w-32 dark:text-slate-200"
                      @keyup.enter="saveCurrentAsProfile"
                    />
                    <button 
                      @click="saveCurrentAsProfile"
                      :disabled="!newProfileName.trim()"
                      class="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                    >
                      <Check class="w-3.5 h-3.5" />
                    </button>
                    <button 
                      @click="isSavingProfile = false; newProfileName = ''"
                      class="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                    >
                      <Plus class="w-3.5 h-3.5 rotate-45" />
                    </button>
                  </div>
                </div>
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 p-6 space-y-4">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-slate-700 dark:text-slate-300">API Base URL</label>
                    <input 
                      v-model="settings.apiBaseUrl"
                      type="text" 
                      class="w-full px-4 py-2.5 border dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                    <div class="relative">
                      <input 
                        v-model="settings.apiKey"
                        :type="showApiKey ? 'text' : 'password'" 
                        class="w-full pl-4 pr-12 py-2.5 border dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100"
                        placeholder="sk-..."
                      />
                      <button 
                        @click="showApiKey = !showApiKey"
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none"
                      >
                        <Eye v-if="showApiKey" class="w-5 h-5" />
                        <EyeOff v-else class="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Model Name</label>
                    <input 
                      v-model="settings.modelName"
                      type="text" 
                      class="w-full px-4 py-2.5 border dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100"
                      placeholder="gpt-3.5-turbo"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">API 配置预设库</h2>
                <div class="bg-slate-200/20 dark:bg-slate-900 rounded-xl shadow-sm border dark:border-slate-800 p-2 space-y-1">
                  <div v-if="settings.profiles.length === 0" class="p-8 text-center text-sm text-slate-400 dark:text-slate-600 italic">
                    暂无预设配置。修改上方配置并点击“保存为预设”。
                  </div>
                  <div 
                    v-for="profile in settings.profiles" 
                    :key="profile.id"
                  >
                    <!-- 编辑模式 -->
                    <div v-if="editingProfileId === profile.id && editProfileForm" class="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-blue-200 dark:border-blue-800/50 shadow-sm space-y-3 my-1">
                      <div class="space-y-1.5">
                        <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">预设名称</label>
                        <input v-model="editProfileForm.name" type="text" class="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-slate-900 dark:text-slate-100" placeholder="预设名称" />
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">API Base URL</label>
                        <input v-model="editProfileForm.apiBaseUrl" type="text" class="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100" />
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">API Key</label>
                        <div class="relative">
                          <input v-model="editProfileForm.apiKey" :type="showEditApiKey ? 'text' : 'password'" class="w-full pl-3 pr-10 py-2 border dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100" />
                          <button @click="showEditApiKey = !showEditApiKey" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none p-1">
                            <Eye v-if="showEditApiKey" class="w-4 h-4" />
                            <EyeOff v-else class="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Model Name</label>
                        <input v-model="editProfileForm.modelName" type="text" class="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-slate-900 dark:text-slate-100" />
                      </div>
                      <div class="flex items-center justify-end gap-2 pt-2">
                        <button @click="cancelEditProfile" class="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                        <button @click="saveEditProfile" :disabled="!editProfileForm.name.trim()" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">保存修改</button>
                      </div>
                    </div>

                    <!-- 正常显示模式 -->
                    <div v-else class="p-3 flex items-center justify-between group hover:bg-white dark:hover:bg-slate-800 transition-colors rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                      <div class="flex flex-col gap-1 min-w-0">
                        <span class="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{{ profile.name }}</span>
                        <div class="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded w-fit">
                          <span class="truncate max-w-32">{{ profile.modelName }}</span>
                          <span class="opacity-30">•</span>
                          <span class="truncate max-w-48">{{ profile.apiBaseUrl }}</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          @click="applyProfile(profile)"
                          class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg transition-colors text-xs font-medium shadow-sm"
                        >
                          <Play class="w-3 h-3 fill-current" />
                          应用
                        </button>
                        <button 
                          @click="startEditProfile(profile)"
                          class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Pencil class="w-4 h-4" />
                        </button>
                        <button 
                          @click="deleteProfile(profile.id)"
                          class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 class="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>                </div>
              </section>
            </template>

            <!-- General Settings -->
            <template v-if="settingsCategory === 'general'">
              <div class="mb-6 border-b dark:border-slate-800 pb-4">
                <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">常规设置</h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">调整软件的翻译行为和质量审计规则。</p>
              </div>

              <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 p-6 space-y-6">
                <!-- Streaming -->
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <label class="text-sm font-semibold text-slate-800 dark:text-slate-200">流式输出</label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">在模型生成文本时逐字渲染，提升响应速度体验。</p>
                  </div>
                  <button 
                    @click="settings.enableStreaming = !settings.enableStreaming"
                    :class="cn(
                      'w-12 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shrink-0',
                      settings.enableStreaming ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    )"
                  >
                    <div :class="cn(
                      'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
                      settings.enableStreaming ? 'translate-x-6' : 'translate-x-0'
                    )"></div>
                  </button>
                </div>

                <div class="h-px bg-slate-100 dark:bg-slate-800"></div>

                <!-- Auto Evaluation -->
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <label class="text-sm font-semibold text-slate-800 dark:text-slate-200">自动质量审计</label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">翻译完成后，自动启动一个次级请求来评估翻译的准确度和语气，并提供改进建议。</p>
                  </div>
                  <button 
                    @click="settings.enableEvaluation = !settings.enableEvaluation"
                    :class="cn(
                      'w-12 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shrink-0',
                      settings.enableEvaluation ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    )"
                  >
                    <div :class="cn(
                      'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
                      settings.enableEvaluation ? 'translate-x-6' : 'translate-x-0'
                    )"></div>
                  </button>
                </div>

                <div class="h-px bg-slate-100 dark:bg-slate-800"></div>

                <!-- Audit Profile Selector -->
                <div class="space-y-3">
                  <div class="space-y-0.5">
                    <label class="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      审计模型
                    </label>
                    <p class="text-xs text-slate-500 dark:text-slate-400">强烈建议选择更强大的模型以获得精准反馈。</p>
                  </div>
                    
                    <!-- Custom Evaluation Profile Dropdown -->
                    <div class="relative lang-dropdown w-full max-w-md">
                      <button 
                        @click.stop="toggleDropdown('evaluationProfile')"
                        class="flex items-center justify-between w-full px-4 py-2 border dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-sm text-slate-700 dark:text-slate-200 group shadow-sm"
                      >
                        <span class="truncate font-medium">{{ currentEvaluationProfileLabel }}</span>
                        <ChevronDown :class="cn('w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:text-blue-500', evaluationProfileDropdownOpen && 'rotate-180')" />
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
                          v-if="evaluationProfileDropdownOpen"
                          class="absolute left-0 mt-2 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col custom-scrollbar"
                        >
                          <button
                            @click="settings.evaluationProfileId = null; evaluationProfileDropdownOpen = false"
                            :class="cn(
                              'px-4 py-3 text-sm text-left transition-colors flex items-center justify-between',
                              settings.evaluationProfileId === null ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50'
                            )"
                          >
                            <span class="font-semibold">使用当前主翻译配置（不推荐）</span>
                            <Check v-if="settings.evaluationProfileId === null" class="w-4 h-4" />
                          </button>
                          <div class="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"></div>
                          <button
                            v-for="profile in settings.profiles"
                            :key="profile.id"
                            @click="settings.evaluationProfileId = profile.id; evaluationProfileDropdownOpen = false"
                            :class="cn(
                              'px-4 py-3 text-sm text-left transition-colors flex items-center justify-between',
                              settings.evaluationProfileId === profile.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            )"
                          >
                            <div class="flex flex-col gap-0.5 min-w-0">
                              <span class="truncate font-semibold">{{ profile.name }}</span>
                              <span class="text-[10px] opacity-60 font-mono">{{ profile.modelName }}</span>
                            </div>
                            <Check v-if="settings.evaluationProfileId === profile.id" class="w-4 h-4 shrink-0" />
                          </button>
                        </div>
                      </transition>
                    </div>
                </div>

              </div>
            </template>

            <!-- Prompt Engineering -->
            <template v-if="settingsCategory === 'prompts'">
              <div class="mb-6 border-b dark:border-slate-800 pb-4">
                <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">提示词工程</h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">深度定制 AI 的系统指令，修改变量占位符将改变其核心逻辑。</p>
              </div>

              <div class="space-y-8">
                <!-- Translation Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">主翻译系统指令</h3>
                    </div>
                    <button @click="settings.systemPromptTemplate = DEFAULT_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.systemPromptTemplate"
                    rows="8"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{SOURCE_CODE}', '{TARGET_CODE}', '{SOURCE_LANG}', '{TARGET_LANG}', '{SPEAKER_IDENTITY}', '{TONE_REGISTER}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>

                <!-- Evaluation Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-amber-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">质量审计指令</h3>
                    </div>
                    <button @click="settings.evaluationPromptTemplate = DEFAULT_EVALUATION_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.evaluationPromptTemplate"
                    rows="12"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{SOURCE_LANG}', '{TARGET_LANG}', '{SPEAKER_IDENTITY}', '{TONE_REGISTER}', '{CONTEXT}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>

                <!-- Refinement Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-green-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">定向润色指令</h3>
                    </div>
                    <button @click="settings.refinementPromptTemplate = DEFAULT_REFINEMENT_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.refinementPromptTemplate"
                    rows="8"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{SOURCE_LANG}', '{TARGET_LANG}', '{SPEAKER_IDENTITY}', '{TONE_REGISTER}', '{CONTEXT}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Chat Prompt Engineering -->
            <template v-if="settingsCategory === 'chat-prompts'">
              <div class="mb-6 border-b dark:border-slate-800 pb-4">
                <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">对话提示词</h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">专门针对“对话模式”优化的系统指令模板。</p>
              </div>

              <div class="space-y-8">
                <!-- Chat Translation Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">对话翻译指令</h3>
                    </div>
                    <button @click="settings.chatSystemPromptTemplate = CONVERSATION_SYSTEM_PROMPT_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.chatSystemPromptTemplate"
                    rows="10"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{ME_NAME}', '{ME_GENDER}', '{ME_LANG}', '{PART_NAME}', '{PART_GENDER}', '{PART_LANG}', '{HISTORY_BLOCK}', '{SENDER_NAME}', '{FROM_LANG}', '{TO_LANG}', '{TARGET_TONE}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>

                <!-- Chat Evaluation Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-amber-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">对话审计指令</h3>
                    </div>
                    <button @click="settings.chatEvaluationPromptTemplate = CONVERSATION_EVALUATION_PROMPT_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.chatEvaluationPromptTemplate"
                    rows="12"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{ME_NAME}', '{ME_GENDER}', '{ME_LANG}', '{PART_NAME}', '{PART_GENDER}', '{PART_LANG}', '{HISTORY_BLOCK}', '{SENDER_NAME}', '{FROM_LANG}', '{TO_LANG}', '{TARGET_TONE}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>

                <!-- Chat Refinement Prompt -->
                <div class="bg-white/80 dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden flex flex-col">
                  <div class="px-5 py-3 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-green-500"></div>
                      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200">对话润色指令</h3>
                    </div>
                    <button @click="settings.chatRefinementPromptTemplate = CONVERSATION_REFINEMENT_PROMPT_TEMPLATE" class="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="settings.chatRefinementPromptTemplate"
                    rows="10"
                    class="w-full p-5 bg-transparent outline-none font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-300 resize-y"
                    spellcheck="false"
                  ></textarea>
                  <div class="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t dark:border-slate-800">
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in ['{ME_NAME}', '{ME_GENDER}', '{ME_LANG}', '{PART_NAME}', '{PART_GENDER}', '{PART_LANG}', '{HISTORY_BLOCK}', '{SENDER_NAME}', '{FROM_LANG}', '{TO_LANG}', '{TARGET_TONE}']" :key="tag" class="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] font-mono rounded-md border dark:border-slate-700 text-slate-500 shadow-sm">{{ tag }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>
</template>
