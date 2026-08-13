import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useTranslationWorkspaceStore = defineStore('translationWorkspace', () => {
  const sourceText = ref('');
  const context = ref('');
  const targetText = ref('');
  const backTranslationText = ref('');
  const backTranslationLanguageCode = ref('');
  const backTranslationError = ref('');
  const isBackTranslating = ref(false);
  const isTranslating = ref(false);
  const activeStreamRequestId = ref<string | null>(null);

  const resetBackTranslation = () => {
    backTranslationText.value = '';
    backTranslationLanguageCode.value = '';
    backTranslationError.value = '';
    isBackTranslating.value = false;
  };

  const clearWorkspace = () => {
    sourceText.value = '';
    targetText.value = '';
    resetBackTranslation();
  };

  return {
    sourceText,
    context,
    targetText,
    backTranslationText,
    backTranslationLanguageCode,
    backTranslationError,
    isBackTranslating,
    isTranslating,
    activeStreamRequestId,
    resetBackTranslation,
    clearWorkspace,
  };
});
