export interface Language {
  displayName: string;
  englishName: string;
  code: string;
}

export const LANGUAGES: Language[] = [
  { displayName: '中文（简体）', englishName: 'Simplified Chinese', code: 'zh-Hans' },
  { displayName: '中文（繁体）', englishName: 'Traditional Chinese', code: 'zh-Hant' },
  { displayName: '英语（美国）', englishName: 'American English', code: 'en-US' },
  { displayName: '英语（英国）', englishName: 'British English', code: 'en-GB' },
  { displayName: '西班牙语', englishName: 'Spanish', code: 'es' },
  { displayName: '葡萄牙语', englishName: 'Portuguese', code: 'pt' },
  { displayName: '日语', englishName: 'Japanese', code: 'ja' },
  { displayName: '韩语', englishName: 'Korean', code: 'ko' },
  { displayName: '法语', englishName: 'French', code: 'fr' },
  { displayName: '德语', englishName: 'German', code: 'de' },
  { displayName: '意大利语', englishName: 'Italian', code: 'it' },
  { displayName: '俄语', englishName: 'Russian', code: 'ru' },
  { displayName: '越南语', englishName: 'Vietnamese', code: 'vi' },
  { displayName: '泰语', englishName: 'Thai', code: 'th' },
  { displayName: '阿拉伯语', englishName: 'Arabic', code: 'ar' },
];

export const SPEAKER_IDENTITY_OPTIONS = [
  { label: '男性', value: 'Male' },
  { label: '女性', value: 'Female' },
  { label: '中性', value: 'Gender-neutral' },
] as const;

export const TONE_REGISTER_OPTIONS = [
  { label: '自动识别', value: 'Auto-detect', description: '分析并保持原文的语气、情绪和礼貌程度' },
  { label: '正式专业', value: 'Formal & Professional', description: '商务邮件、法律合同、官方报告' },
  { label: '礼貌客气', value: 'Polite & Respectful', description: '与长辈、客户或初次见面的人交流' },
  { label: '礼貌随和', value: 'Polite & Conversational', description: '得体但不刻板的日常对话' },
  { label: '中性标准', value: 'Neutral & Standard', description: '维基百科、说明书、客观的新闻报道' },
  { label: '非正式', value: 'Casual & Informal', description: '朋友聊天、社交媒体、非正式简讯' },
  { label: '亲切友好', value: 'Warm & Friendly', description: '社区信函、给朋友的建议、温馨提示' },
  { label: '严谨权威', value: 'Strict & Authoritative', description: '警示标志、强制规定、上级指令' },
  { label: '热情生动', value: 'Enthusiastic & Vivid', description: '广告文案、旅游推荐、博主推文' },
] as const;

export interface ApiProfile {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  sourceLang: Language;
  targetLang: Language;
  sourceText: string;
  targetText: string;
  context: string;
  speakerIdentity: string;
  toneRegister: string;
  modelName: string;
}

export interface Participant {
  name: string;
  gender: string;
  language: Language;
  tone: string;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner';
  original: string;
  translated: string;
  timestamp: string;
  evaluation?: string;
  isEvaluating?: boolean;
  isRefining?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  me: Participant;
  partner: Participant;
  messages: ChatMessage[];
  lastActivity: string;
}
