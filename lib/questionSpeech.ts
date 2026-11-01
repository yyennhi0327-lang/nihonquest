import { NativeLanguage, SUPPORTED_LANGUAGES } from "@/lib/languages";

const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export type QuizSpeechMode = "ja_only" | "bilingual";

export interface QuestionSpeechInfo {
  /** The clean text that should be spoken by TTS */
  targetText: string;
  /** Extracted Japanese target word/kana, if any */
  japaneseTarget?: string;
  /** Clean localized full question (safe for TTS, without IPA glitched symbols) */
  cleanQuestion: string;
  /** Whether the target to pronounce is specifically Japanese */
  isJapaneseTarget: boolean;
  /** BCP 47 language code for TTS (e.g. "ja-JP", "vi-VN", "en-US") */
  speechLang: string;
  /** Badge text to show next to the button (e.g. "ひと", "ふ"), if applicable */
  badgeText?: string;
  /** Human-readable accessible label for the speak button */
  buttonLabel: string;
}

const ROMAJI_TO_KANA: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ma", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", n: "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "zo",
  da: "だ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "pi", pu: "ぷ", pe: "pe", po: "po",
  ai: "あい", ie: "いえ", ue: "うえ", ao: "あお",
  seki: "せき", soko: "そこ", neko: "ねこ", inu: "いぬ",
  kasa: "かさ", sushi: "すし", asa: "あさ", eki: "えき",
  kiku: "きく", sake: "さけ", sekai: "せかい",
};

/**
 * Clean Japanese sentence for natural TTS pronunciation (e.g. replace fill-in blanks with small pause).
 */
export function cleanJapaneseForSpeech(text: string): string {
  return text
    .replace(/_{2,}/g, "、")
    .replace(/[⋯…]{2,}/g, "、")
    .replace(/^[-\s:：]+|[-\s:：]+$/g, "")
    .trim();
}

/**
 * Clean question text so TTS can read it naturally:
 * - Strip strange IPA phonetic symbols like /ɸɯ/ that crash or mute speech engines
 * - Keep explanations like (âm gió 'fu')
 */
export function cleanQuestionForSpeech(text: string): string {
  return text
    .replace(/\/[^/\s]{1,10}\//g, "") // Remove IPA slashes like /ɸɯ/
    .replace(/_{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract target speech information from a quiz question.
 */
export function getQuestionSpeechInfo(
  rawQuestion: string,
  localizedQuestion: string,
  nativeLang: NativeLanguage = "vi"
): QuestionSpeechInfo {
  const source = (rawQuestion || "").trim();
  const localized = (localizedQuestion || source).trim();
  const cleanQ = cleanQuestionForSpeech(localized);

  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === nativeLang);
  const nativeSpeechLang = langInfo?.speechLang || "vi-VN";

  // 1. Quoted Japanese text: '...', "...", 「...」, 『...』, 【...】, [...]
  const quoteMatches = [...source.matchAll(/['"‘“「『【\[]([^'"’”」』】\]]+)['"’”」』】\]]/g)];
  for (const match of quoteMatches) {
    const candidate = match[1].trim();
    // Direct Japanese characters
    if (JAPANESE_CHAR_REGEX.test(candidate)) {
      const cleaned = cleanJapaneseForSpeech(candidate);
      return {
        targetText: cleaned,
        japaneseTarget: cleaned,
        cleanQuestion: cleanQ,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        badgeText: cleaned.length <= 15 ? cleaned : undefined,
        buttonLabel: getListenTargetLabel(cleaned, nativeLang),
      };
    }

    // Romaji quoted (e.g. 'fu', 'seki', 'a')
    const lowerRomaji = candidate.toLowerCase();
    if (ROMAJI_TO_KANA[lowerRomaji]) {
      const kana = ROMAJI_TO_KANA[lowerRomaji];
      return {
        targetText: kana,
        japaneseTarget: kana,
        cleanQuestion: cleanQ,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        badgeText: `${kana} (${candidate})`,
        buttonLabel: getListenTargetLabel(`${kana} (${candidate})`, nativeLang),
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
        japaneseTarget: cleaned,
        cleanQuestion: cleanQ,
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
        japaneseTarget: cleaned,
        cleanQuestion: cleanQ,
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
      japaneseTarget: cleaned,
      cleanQuestion: cleanQ,
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
      japaneseTarget: cleaned,
      cleanQuestion: cleanQ,
      isJapaneseTarget: true,
      speechLang: "ja-JP",
      badgeText: cleaned.length <= 15 ? cleaned : undefined,
      buttonLabel: getListenTargetLabel(cleaned, nativeLang),
    };
  }

  // 6. No Japanese target found in question -> Speak localized question in user's native language!
  return {
    targetText: cleanQ,
    cleanQuestion: cleanQ,
    isJapaneseTarget: false,
    speechLang: nativeSpeechLang,
    buttonLabel: getReadQuestionLabel(nativeLang),
  };
}

function getListenTargetLabel(target: string, lang: NativeLanguage): string {
  if (lang === "en") return `Listen: ${target}`;
  if (lang === "zh-CN") return `听发音：${target}`;
  if (lang === "zh-TW") return `聽發音：${target}`;
  if (lang === "ko") return `발음 듣기: ${target}`;
  if (lang === "es") return `Escuchar: ${target}`;
  if (lang === "fr") return `Écouter : ${target}`;
  if (lang === "de") return `Anhören: ${target}`;
  return `Nghe phát âm: ${target}`;
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
