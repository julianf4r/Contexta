import type { Language, Participant } from '../domain/translation';

interface SingleTranslationPromptContext {
  sourceLang: Language;
  targetLang: Language;
  speakerIdentity: string;
  toneRegister: string;
  context: string;
}

interface ConversationPromptContext {
  me: Participant;
  partner: Participant;
  historyBlock: string;
  senderName: string;
  fromLang: Language;
  toLang: Language;
  targetTone: string;
}

function replaceTokens(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
    template,
  );
}

export function buildSingleTranslationSystemPrompt(
  template: string,
  context: Omit<SingleTranslationPromptContext, 'context'>,
) {
  return replaceTokens(template, {
    SOURCE_LANG: context.sourceLang.englishName,
    SOURCE_CODE: context.sourceLang.code,
    TARGET_LANG: context.targetLang.englishName,
    TARGET_CODE: context.targetLang.code,
    SPEAKER_IDENTITY: context.speakerIdentity,
    TONE_REGISTER: context.toneRegister,
  });
}

export function buildSingleEvaluationSystemPrompt(
  template: string,
  context: SingleTranslationPromptContext,
) {
  return replaceTokens(template, {
    SOURCE_LANG: context.sourceLang.englishName,
    TARGET_LANG: context.targetLang.englishName,
    SPEAKER_IDENTITY: context.speakerIdentity,
    TONE_REGISTER: context.toneRegister,
    CONTEXT: context.context || 'None',
  });
}

export function buildSingleRefinementSystemPrompt(
  template: string,
  context: SingleTranslationPromptContext,
) {
  return buildSingleEvaluationSystemPrompt(template, context);
}

export function buildSingleTranslationUserPrompt(sourceText: string, context: string) {
  return context
    ? `[Context]\n${context}\n\n[Text to Translate]\n${sourceText}`
    : `[Text to Translate]\n${sourceText}`;
}

export function buildSingleEvaluationUserPrompt(sourceText: string, targetText: string) {
  return `[Source Text]\n${sourceText}\n\n[Translated Text]\n${targetText}`;
}

export function buildSingleRefinementUserPrompt(sourceText: string, currentTranslation: string, suggestions: string[]) {
  const formattedSuggestions = suggestions.map((text, index) => `${index + 1}. ${text}`).join('\n');
  return `[Source Text]\n${sourceText}\n\n[Current Translation]\n${currentTranslation}\n\n[User Feedback]\n${formattedSuggestions}`;
}

export function buildConversationSystemPrompt(template: string, context: ConversationPromptContext, emptyHistoryFallback: string) {
  return replaceTokens(template, {
    ME_NAME: context.me.name,
    ME_GENDER: context.me.gender,
    ME_LANG: context.me.language.englishName,
    PART_NAME: context.partner.name,
    PART_GENDER: context.partner.gender,
    PART_LANG: context.partner.language.englishName,
    HISTORY_BLOCK: context.historyBlock || emptyHistoryFallback,
    SENDER_NAME: context.senderName,
    FROM_LANG: context.fromLang.englishName,
    TO_LANG: context.toLang.englishName,
    TARGET_TONE: context.targetTone,
  });
}

export function buildConversationTranslationUserPrompt(text: string) {
  return `[Text to Translate]\n${text}`;
}

export function buildConversationEvaluationUserPrompt(sourceText: string, currentTranslation: string) {
  return `[Source Text]\n${sourceText}\n\n[Current Translation]\n${currentTranslation}`;
}

export function buildConversationRefinementUserPrompt(sourceText: string, currentTranslation: string, suggestions: string[]) {
  return `[Source Text]\n${sourceText}\n\n[Current Translation]\n${currentTranslation}\n\n[Suggestions]\n${suggestions.map((text) => `- ${text}`).join('\n')}`;
}
