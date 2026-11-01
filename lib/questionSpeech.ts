import { NativeLanguage, SUPPORTED_LANGUAGES } from "@/lib/languages";

const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export interface QuestionSpeechInfo {
  /** The clean text that should be spoken by TTS */
  targetText: string;
  /** Whether the target to pronounce is specifically Japanese */
  isJapaneseTarget: boolean;
  /** BCP 47 language code for TTS (e.g. "ja-JP", "vi-VN", "en-US") */
  speechLang: string;
  /** Badge text to show next to the button (e.g. "ひと"), if applicable */
  badgeText?: string;
  /** Human-readable accessible label for the speak button */
  buttonLabel: string;
}

/**
 * Clean Japanese sentence for natural TTS pronunciation (e.g. replace fill-in blanks with small pause).
 */
function cleanJapaneseForSpeech(text: string): string {
  return text
    .replace(/_{2,}/g, "、")
    .replace(/[⋯…]{2,}/g, "、")
    .replace(/^[-\s:：]+|[-\s:：]+$/g, "")
    .trim();
}

/**
 * Extract target speech information from a quiz question.
 *
 * Priorities:
 * 1. If the question asks about a specific Japanese word, kanji, kana, or dialogue,
 *    extract that Japanese target so the user hears native Japanese pronunciation.
 * 2. If the question is a conceptual / meta grammar question without Japanese,
 *    speak the localized question text in the user's selected native language (Vi, En, Zh, Ko, etc.).
 */
export function getQuestionSpeechInfo(
  rawQuestion: string,
  localizedQuestion: string,
  nativeLang: NativeLanguage = "vi"
): QuestionSpeechInfo {
  const source = (rawQuestion || "").trim();
  const localized = (localizedQuestion || source).trim();

  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === nativeLang);
  const nativeSpeechLang = langInfo?.speechLang || "vi-VN";

  // 1. Quoted Japanese text: '...', "...", 「...」, 『...』, 【...】, [...]
  const quoteMatches = [...source.matchAll(/['"‘“「『【\[]([^'"’”」』】\]]+)['"’”」』】\]]/g)];
  for (const match of quoteMatches) {
    const candidate = match[1].trim();
    if (JAPANESE_CHAR_REGEX.test(candidate)) {
      const cleaned = cleanJapaneseForSpeech(candidate);
      return {
        targetText: cleaned,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        badgeText: cleaned.length <= 15 ? cleaned : undefined,
        buttonLabel: getListenTargetLabel(cleaned, nativeLang),
      };
    }
  }

  // 2. Parenthesized Japanese: e.g. "chữ 'a' (あ)" or "chữ (あ)"
  const parenMatches = [...source.matchAll(/[\(（]([^\)）]+)[\)）]/g)];
  for (const match of parenMatches) {
    const candidate = match[1].trim();
    if (JAPANESE_CHAR_REGEX.test(candidate)) {
      const cleaned = cleanJapaneseForSpeech(candidate);
      return {
        targetText: cleaned,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        badgeText: cleaned.length <= 15 ? cleaned : undefined,
        buttonLabel: getListenTargetLabel(cleaned, nativeLang),
      };
    }
  }

  // 3. Colon-separated sentence / fill-in-the-blank (e.g. "Điền trợ từ...: わたし___田中です。")
  const colonParts = source.split(/[:：]/);
  if (colonParts.length > 1) {
    const afterColon = colonParts.slice(1).join(":").trim();
    if (JAPANESE_CHAR_REGEX.test(afterColon)) {
      const cleaned = cleanJapaneseForSpeech(afterColon);
      return {
        targetText: cleaned,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        badgeText: cleaned.length <= 12 ? cleaned : undefined,
        buttonLabel: getListenTargetLabel(cleaned, nativeLang),
      };
    }
  }

  // 4. If the question itself contains significant Japanese characters (e.g. full Japanese sentence)
  const jpChars = (source.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  const nonSpaceLength = source.replace(/\s+/g, "").length;
  if (jpChars >= 3 && (jpChars / Math.max(1, nonSpaceLength) > 0.35 || JAPANESE_CHAR_REGEX.test(source.slice(0, 3)))) {
    const cleaned = cleanJapaneseForSpeech(source);
    return {
      targetText: cleaned,
      isJapaneseTarget: true,
      speechLang: "ja-JP",
      buttonLabel: getListenJapaneseLabel(nativeLang),
    };
  }

  // 5. Look for any isolated Japanese words in the question
  const isolatedJp = source.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]{2,20}/g);
  if (isolatedJp && isolatedJp.length > 0) {
    const longest = isolatedJp.sort((a, b) => b.length - a.length)[0];
    const cleaned = cleanJapaneseForSpeech(longest);
    return {
      targetText: cleaned,
      isJapaneseTarget: true,
      speechLang: "ja-JP",
      badgeText: cleaned.length <= 15 ? cleaned : undefined,
      buttonLabel: getListenTargetLabel(cleaned, nativeLang),
    };
  }

  // 6. No Japanese target found in question -> Speak localized question in user's native language!
  return {
    targetText: localized,
    isJapaneseTarget: false,
    speechLang: nativeSpeechLang,
    buttonLabel: getReadQuestionLabel(nativeLang),
  };
}

function getListenTargetLabel(target: string, lang: NativeLanguage): string {
  if (lang === "en") return `Listen pronunciation: ${target}`;
  if (lang === "zh-CN") return `听日语发音：${target}`;
  if (lang === "zh-TW") return `聽日語發音：${target}`;
  if (lang === "ko") return `일본어 발음 듣기: ${target}`;
  if (lang === "es") return `Escuchar pronunciación: ${target}`;
  if (lang === "fr") return `Écouter la prononciation : ${target}`;
  if (lang === "de") return `Aussprache anhören: ${target}`;
  return `Nghe phát âm tiếng Nhật: ${target}`;
}

function getListenJapaneseLabel(lang: NativeLanguage): string {
  if (lang === "en") return "Listen to Japanese sentence";
  if (lang === "zh-CN") return "听日语原句";
  if (lang === "zh-TW") return "聽日語原句";
  if (lang === "ko") return "일본어 문장 듣기";
  if (lang === "es") return "Escuchar frase en japonés";
  if (lang === "fr") return "Écouter la phrase en japonais";
  if (lang === "de") return "Japanischen Satz anhören";
  return "Nghe phát âm câu tiếng Nhật";
}

function getReadQuestionLabel(lang: NativeLanguage): string {
  if (lang === "en") return "Read question aloud";
  if (lang === "zh-CN") return "朗读题目";
  if (lang === "zh-TW") return "朗讀題目";
  if (lang === "ko") return "문제 읽기";
  if (lang === "es") return "Leer pregunta";
  if (lang === "fr") return "Lire la question";
  if (lang === "de") return "Frage vorlesen";
  return "Đọc câu hỏi";
}

