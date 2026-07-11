import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { EvaluationResult } from '../lib/translation-service';

export const useTranslationWorkspaceStore = defineStore('translationWorkspace', () => {
  const sourceText = ref('');
  const context = ref('');
  const targetText = ref('');
  const backTranslationText = ref('');
  const backTranslationError = ref('');
  const isBackTranslating = ref(false);
  const isTranslating = ref(false);
  const currentHistoryId = ref<string | null>(null);

  const evaluationResult = ref<EvaluationResult | null>(null);
  const isEvaluating = ref(false);
  const isRefining = ref(false);
  const selectedSuggestionIds = ref<number[]>([]);
  const appliedSuggestionIds = ref<number[]>([]);
  const activeStreamRequestId = ref<string | null>(null);

  const resetEvaluationState = () => {
    evaluationResult.value = null;
    selectedSuggestionIds.value = [];
    appliedSuggestionIds.value = [];
  };

  const resetBackTranslation = () => {
    backTranslationText.value = '';
    backTranslationError.value = '';
    isBackTranslating.value = false;
  };

  const clearWorkspace = () => {
    sourceText.value = '';
    targetText.value = '';
    resetBackTranslation();
    resetEvaluationState();
  };

  const toggleSuggestion = (id: number) => {
    const index = selectedSuggestionIds.value.indexOf(id);
    if (index > -1) selectedSuggestionIds.value.splice(index, 1);
    else selectedSuggestionIds.value.push(id);
  };

  return {
    sourceText,
    context,
    targetText,
    backTranslationText,
    backTranslationError,
    isBackTranslating,
    isTranslating,
    currentHistoryId,
    evaluationResult,
    isEvaluating,
    isRefining,
    selectedSuggestionIds,
    appliedSuggestionIds,
    activeStreamRequestId,
    resetEvaluationState,
    resetBackTranslation,
    clearWorkspace,
    toggleSuggestion,
  };
});
