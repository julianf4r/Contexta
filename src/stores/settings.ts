import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { LANGUAGES, SPEAKER_IDENTITY_OPTIONS, TONE_REGISTER_OPTIONS, type ApiProfile, type Language } from '../domain/translation';

export type ThemeMode = 'light' | 'dark' | 'system';

export const DEFAULT_TEMPLATE = `You are a professional {SOURCE_LANG} ({SOURCE_CODE}) to {TARGET_LANG} ({TARGET_CODE}) translator. Your goal is to accurately convey the meaning and nuances of the original {SOURCE_LANG} text while adhering to {TARGET_LANG} grammar, vocabulary, and cultural sensitivities.

[Constraints]
1. Speaker Gender: {SPEAKER_IDENTITY}. Use it only for the speaker's own first-person references or grammatical agreement when relevant in {TARGET_LANG}. If set to 'Auto-detect', infer it only when the source makes it clear. Preserve all people and gender terms explicitly mentioned in the source.
2. Tone & Register: {TONE_REGISTER}. (If set to 'Auto-detect', analyze the tone, formality, and emotional nuance of the source text and faithfully replicate it. Do not neutralize strong emotions or unique styles.)
3. Produce ONLY the {TARGET_LANG} translation, without any additional explanations, notes, or commentary.`;

export const CONVERSATION_SYSTEM_PROMPT_TEMPLATE = `# Role: Professional Real-time Conversation Translator

# Participants:
- Participant A: [Name: {ME_NAME}, Speaker Gender: {ME_GENDER}, Language: {ME_LANG}]
- Participant B: [Name: {PART_NAME}, Speaker Gender: {PART_GENDER}, Language: {PART_LANG}]

# Recent Conversation Flow:
{HISTORY_BLOCK}

# Current Turn to Translate:
- Speaker: {SENDER_NAME}
- Source Language: {FROM_LANG}
- Target Language: {TO_LANG}
- Intended Tone/Register: {TARGET_TONE}

# Constraints
1. Contextual Awareness: Use the [Conversation History] to resolve pronouns (it, that, etc.) and maintain consistency.
2. Personalization & Tone: Use the current speaker's gender only for their own first-person references or grammatical agreement when relevant. If it is 'Auto-detect', infer it only when the source makes it clear. Preserve all people and gender terms explicitly mentioned in the source. Faithfully replicate the intended tone, maintaining the formality, emotional nuance, and unique style of the source text without neutralizing it.
3. Natural Flow: Keep the translation concise and natural for a chat environment. Avoid "translationese".
4. Strictly avoid over-translation: Do not add extra information not present in the source text.
5. Output ONLY the translated text, no explanations.`;

export const useSettingsStore = defineStore('settings', () => {
  const themeMode = useLocalStorage<ThemeMode>('theme-mode', 'system');
  const apiBaseUrl = useLocalStorage('api-base-url', 'http://localhost:11434/v1');
  const apiKey = useLocalStorage('api-key', '');
  const modelName = useLocalStorage('model-name', 'translategemma:12b');
  const profiles = useLocalStorage<ApiProfile[]>('api-profiles', []);
  const backTranslationApiKey = useLocalStorage('back-translation-api-key', '');
  const backTranslationTargetLanguageCode = useLocalStorage('back-translation-target-language', 'source');
  const enableStreaming = useLocalStorage('enable-streaming', true);
  const systemPromptTemplate = useLocalStorage('system-prompt-template', DEFAULT_TEMPLATE);
  
  const chatSystemPromptTemplate = useLocalStorage('chat-system-prompt-template', CONVERSATION_SYSTEM_PROMPT_TEMPLATE);

  // 存储整个对象以保持一致性
  const sourceLang = useLocalStorage<Language>('source-lang-v2', LANGUAGES[0]);
  const targetLang = useLocalStorage<Language>('target-lang-v2', LANGUAGES[4]);

  // 按源语言分别存储身份和语气，实现基于语言自动切换
  const speakerIdentityMap = useLocalStorage<Record<string, string>>('speaker-identity-map', {});
  const toneRegisterMap = useLocalStorage<Record<string, string>>('tone-register-map', {});

  const speakerIdentity = computed({
    get: () => speakerIdentityMap.value[sourceLang.value.code] || SPEAKER_IDENTITY_OPTIONS[0].value,
    set: (val) => { speakerIdentityMap.value[sourceLang.value.code] = val; }
  });

  const toneRegister = computed({
    get: () => toneRegisterMap.value[sourceLang.value.code] || TONE_REGISTER_OPTIONS[0].value,
    set: (val) => { toneRegisterMap.value[sourceLang.value.code] = val; }
  });

  return {
    themeMode,
    apiBaseUrl,
    apiKey,
    modelName,
    profiles,
    backTranslationApiKey,
    backTranslationTargetLanguageCode,
    enableStreaming,
    systemPromptTemplate,
    chatSystemPromptTemplate,
    sourceLang,
    targetLang,
    speakerIdentity,
    toneRegister,
  };
});
