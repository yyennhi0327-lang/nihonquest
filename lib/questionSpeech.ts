import { NativeLanguage, SUPPORTED_LANGUAGES } from "@/lib/languages";

const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export type QuestionSpeechMode = "target" | "bilingual" | "full_ja";

export interface QuestionSpeechInfo {
  /** The clean text that should be spoken by TTS */
  targetText: string;
  /** Whether the target to pronounce is specifically Japanese */
  isJapaneseTarget: boolean;
  /** BCP 47 language code for TTS (e.g. "ja-JP", "vi-VN", "en-US") */
  speechLang: string;
  /** Badge text to show next to the button (e.g. "ひと", "ふ"), if applicable */
  badgeText?: string;
  /** Human-readable accessible label for the speak button */
  buttonLabel: string;
  /** Current speech mode */
  mode: QuestionSpeechMode;
}

/**
 * Common Romaji syllables mapped to Hiragana for phonetic questions (like "'fu'", "'a'", etc.)
 */
const ROMAJI_TO_KANA: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", shi: "し", su: "す", se: "せ", so: "そ",
  ta: "た", chi: "ち", tsu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", n: "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ai: "あい", ie: "いえ", ue: "うえ", ao: "あお",
  kasa: "かさ", sushi: "すし", eki: "えき", neko: "ねこ", inu: "いぬ",
  hito: "ひと", tori: "とり", hana: "はな", yama: "やま", kawa: "かわ",
};

/**
 * Clean unpronounceable IPA symbols (like /ɸɯ/, /ɕi/, /t͡sɯ/) that choke TTS engines.
 */
export function cleanIpaSymbols(text: string): string {
  if (!text) return "";
  return text
    // Replace IPA symbols with phonetic descriptions or clear text
    .replace(/\/ɸɯ\//g, "phát âm fu")
    .replace(/\/ɕi\//g, "phát âm shi")
    .replace(/\/t͡sɯ\//g, "phát âm tsu")
    .replace(/\/t͡ɕi\//g, "phát âm chi")
    .replace(/\/[^\/]{1,8}\//g, "") // strip any other short IPA slash notation
    .replace(/_{2,}/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean Japanese sentence for natural TTS pronunciation.
 */
function cleanJapaneseForSpeech(text: string): string {
  return text
    .replace(/_{2,}/g, "、")
    .replace(/[⋯…]{2,}/g, "、")
    .replace(/^[-\s:：]+|[-\s:：]+$/g, "")
    .trim();
}

/**
 * Translate Vietnamese question templates to natural Japanese for "Full Japanese" immersion mode.
 */
function translateQuestionToJapanese(source: string): string | null {
  const q = source.trim();

  let m = q.match(/Từ\s*['"‘“](.+?)['"’”]\s*[\(（](.+?)[\)）]\s*có nghĩa là gì\??/i);
  if (m) return `「${m[1]}」という言葉の意味は何ですか？`;

  m = q.match(/Từ ghép\s*['"‘“](.+?)['"’”]\s*[\(（](.+?)[\)）]\s*trong tiếng Nhật có nghĩa là gì\??/i);
  if (m) return `日本語の「${m[1]}」という言葉の意味は何ですか？`;

  m = q.match(/Từ\s*['"‘“](.+?)['"’”]\s*có nghĩa là gì\??/i);
  if (m) return `「${m[1]}」の意味は何ですか？`;

  m = q.match(/Chữ cái nào sau đây là chữ\s*['"‘“](.+?)['"’”]\s*[\(（](.+?)[\)）]\??/i);
  if (m) return `次の文字の中で「${m[2]}」はどれですか？`;

  m = q.match(/Chữ cái nào là chữ\s*['"‘“](.+?)['"’”]\s*[\(（](.+?)[\)）]\??/i);
  if (m) return `「${m[2]}」の文字はどれですか？`;

  m = q.match(/Chữ nào trong hàng Ha có cách phát âm là.*?'fu'.*?\??/i);
  if (m) return `ハ行の中で、「ふ」の発音をする文字はどれですか？`;

  m = q.match(/Chữ\s*['"‘“](.+?)['"’”]\s*(?:được)?\s*đọc là gì trong phiên âm Romaji\??/i);
  if (m) return `「${m[1]}」のローマ字の読み方は何ですか？`;

  m = q.match(/Chữ\s*['"‘“](.+?)['"’”]\s*đọc là gì\??/i);
  if (m) return `「${m[1]}」の読み方は何ですか？`;

  m = q.match(/Cách đọc Hiragana của từ\s*['"‘“](.+?)['"’”]\s*là gì\??/i);
  if (m) return `「${m[1]}」のひらがなの読み方は何ですか？`;

  m = q.match(/Chọn nghĩa đúng của từ\s*['"‘“](.+?)['"’”]:?/i);
  if (m) return `「${m[1]}」の正しい意味を選んでください。`;

  if (q.includes("Điền trợ từ thích hợp vào chỗ trống")) {
    const colonParts = q.split(/[:：]/);
    const after = colonParts.length > 1 ? colonParts.slice(1).join("：").trim() : "";
    return `空欄に適した助詞を入れてください${after ? `：${after.replace(/_{2,}/g, "、")}` : "。"}`;
  }

  if (q.includes("Chọn từ thích hợp điền vào chỗ trống")) {
    const colonParts = q.split(/[:：]/);
    const after = colonParts.length > 1 ? colonParts.slice(1).join("：").trim() : "";
    return `空欄に適した言葉を入れてください${after ? `：${after.replace(/_{2,}/g, "、")}` : "。"}`;
  }

  m = q.match(/Ý nghĩa của mẫu câu\s*['"‘“](.+?)['"’”]\s*là gì\??/i);
  if (m) return `文型「${m[1]}」の意味は何ですか？`;

  // If question is already largely in Japanese
  const jpChars = (q.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  if (jpChars >= 4) {
    return cleanJapaneseForSpeech(q);
  }

  return null;
}

/**
 * Extract target speech information from a quiz question, supporting:
 * 1. "target": Speaks only the target Japanese word/character/sentence (e.g. 'ひと', 'ふ')
 * 2. "bilingual": Speaks the question in user's native language with IPA cleaned + Japanese target
 * 3. "full_ja": Translates entire question into 100% natural Japanese immersion speech
 */
export function getQuestionSpeechInfo(
  rawQuestion: string,
  localizedQuestion: string,
  nativeLang: NativeLanguage = "vi",
  mode: QuestionSpeechMode = "target"
): QuestionSpeechInfo {
  const source = (rawQuestion || "").trim();
  const localized = (localizedQuestion || source).trim();

  const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === nativeLang);
  const nativeSpeechLang = langInfo?.speechLang || "vi-VN";

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 3: FULL JAPANESE IMMERSION ("full_ja")
  // ──────────────────────────────────────────────────────────────────────────
  if (mode === "full_ja") {
    const jaTranslation = translateQuestionToJapanese(source);
    if (jaTranslation) {
      return {
        targetText: jaTranslation,
        isJapaneseTarget: true,
        speechLang: "ja-JP",
        buttonLabel: "🇯🇵 Nghe toàn bộ câu hỏi bằng tiếng Nhật",
        mode,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Extract Japanese target from question
  // ──────────────────────────────────────────────────────────────────────────
  let extractedTarget: string | null = null;
  let targetKana: string | null = null;

  // 1. Quoted text check
  const quoteMatches = [...source.matchAll(/['"‘“「『【\[]([^'"’”」』】\]]+)['"’”」』】\]]/g)];
  for (const match of quoteMatches) {
    const candidate = match[1].trim();
    if (JAPANESE_CHAR_REGEX.test(candidate)) {
      extractedTarget = cleanJapaneseForSpeech(candidate);
      break;
    }
    // Check if quote is a known Romaji sound (e.g. 'fu', 'a', 'ha', 'hito')
    const lower = candidate.toLowerCase();
    if (ROMAJI_TO_KANA[lower]) {
      extractedTarget = ROMAJI_TO_KANA[lower];
      targetKana = ROMAJI_TO_KANA[lower];
      break;
    }
  }

  // 2. Parentheses check (e.g. "chữ 'a' (あ)")
  if (!extractedTarget) {
    const parenMatches = [...source.matchAll(/[\(（]([^\)）]+)[\)）]/g)];
    for (const match of parenMatches) {
      const candidate = match[1].trim();
      if (JAPANESE_CHAR_REGEX.test(candidate)) {
        extractedTarget = cleanJapaneseForSpeech(candidate);
        break;
      }
    }
  }

  // 3. Colon-separated Japanese sentence (e.g. "Điền trợ từ...: わたし___田中です。")
  if (!extractedTarget) {
    const colonParts = source.split(/[:：]/);
    if (colonParts.length > 1) {
      const afterColon = colonParts.slice(1).join(":").trim();
      if (JAPANESE_CHAR_REGEX.test(afterColon)) {
        extractedTarget = cleanJapaneseForSpeech(afterColon);
      }
    }
  }

  // 4. Question itself is primarily Japanese
  if (!extractedTarget) {
    const jpChars = (source.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
    const nonSpaceLength = source.replace(/\s+/g, "").length;
    if (jpChars >= 3 && (jpChars / Math.max(1, nonSpaceLength) > 0.35 || JAPANESE_CHAR_REGEX.test(source.slice(0, 3)))) {
      extractedTarget = cleanJapaneseForSpeech(source);
    }
  }

  // 5. Look for isolated Japanese words
  if (!extractedTarget) {
    const isolatedJp = source.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]{2,20}/g);
    if (isolatedJp && isolatedJp.length > 0) {
      const longest = isolatedJp.sort((a, b) => b.length - a.length)[0];
      extractedTarget = cleanJapaneseForSpeech(longest);
    }
  }

  // Special case: "hàng Ha ... 'fu'" -> target is 'ふ'
  if (!extractedTarget && source.includes("hàng Ha") && source.includes("'fu'")) {
    extractedTarget = "ふ";
    targetKana = "ふ";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 2: BILINGUAL ("bilingual")
  // ──────────────────────────────────────────────────────────────────────────
  if (mode === "bilingual") {
    const cleanLocalized = cleanIpaSymbols(localized);
    return {
      targetText: cleanLocalized,
      isJapaneseTarget: false,
      speechLang: nativeSpeechLang,
      badgeText: targetKana || extractedTarget || undefined,
      buttonLabel: `🌐 Đọc câu hỏi (${langInfo?.nativeName || "Bản ngữ"})`,
      mode,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODE 1: TARGET ONLY ("target" - Default)
  // ──────────────────────────────────────────────────────────────────────────
  if (extractedTarget) {
    return {
      targetText: extractedTarget,
      isJapaneseTarget: true,
      speechLang: "ja-JP",
      badgeText: extractedTarget.length <= 15 ? extractedTarget : undefined,
      buttonLabel: getListenTargetLabel(extractedTarget, nativeLang),
      mode,
    };
  }

  // Fallback if no Japanese target found: Speak localized question with clean IPA
  const cleanFallback = cleanIpaSymbols(localized);
  return {
    targetText: cleanFallback,
    isJapaneseTarget: false,
    speechLang: nativeSpeechLang,
    buttonLabel: getReadQuestionLabel(nativeLang),
    mode,
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
