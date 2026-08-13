import type { Language, Participant } from '../domain/translation';

interface SingleTranslationPromptContext {
  sourceLang: Language;
  targetLang: Language;
  speakerIdentity: string;
  toneRegister: string;
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
  context: SingleTranslationPromptContext,
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

export function buildSingleTranslationUserPrompt(sourceText: string) {
  return `[Text to Translate]\n${sourceText}`;
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
