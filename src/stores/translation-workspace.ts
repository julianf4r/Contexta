import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { EvaluationResult } from '../lib/translation-service';

export const useTranslationWorkspaceStore = defineStore('translationWorkspace', () => {
  const sourceText = ref('');
  const context = ref('');
  const targetText = ref('');
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

  const clearWorkspace = () => {
    sourceText.value = '';
    targetText.value = '';
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
    isTranslating,
    currentHistoryId,
    evaluationResult,
    isEvaluating,
    isRefining,
    selectedSuggestionIds,
    appliedSuggestionIds,
    activeStreamRequestId,
    resetEvaluationState,
    clearWorkspace,
    toggleSuggestion,
  };
});
