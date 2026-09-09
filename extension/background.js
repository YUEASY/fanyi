const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get({
    enabledHosts: null,
    familiarWordsInitialized: false,
  });
  if (!Array.isArray(stored.enabledHosts)) {
    await chrome.storage.local.set({ enabledHosts: [] });
  }
  if (!stored.familiarWordsInitialized) {
    const response = await fetch(chrome.runtime.getURL("google-10000-english.txt"));
    if (!response.ok) throw new Error("无法加载初始熟词表");
    const familiarWords = (await response.text())
      .split(/\r?\n/u)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 1500);
    await chrome.storage.local.set({
      initialFamiliarWords: familiarWords,
      familiarWords,
      familiarWordsInitialized: true,
    });
  }
});

function extractLlmContent(data) {
  return data?.choices?.[0]?.message?.content;
}

function parseLlmContent(content) {
  const trimmed = content.trim();
  let jsonText = trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fenced) jsonText = fenced[1].trim();
  const parsed = JSON.parse(jsonText);
  if (typeof parsed?.translation !== "string" || typeof parsed?.explanation !== "string") {
    throw new Error("DeepSeek 响应缺少译文或解释");
  }
  return { translation: parsed.translation.trim(), explanation: parsed.explanation.trim() };
}

async function handleDeepSeekTranslate(message) {
  try {
    const stored = await chrome.storage.local.get({
      deepseekApiKey: "",
      deepseekApiUrl: DEFAULT_DEEPSEEK_API_URL,
    });
    if (!stored.deepseekApiKey) return { ok: false, error: "尚未配置 DeepSeek API Key" };

    let response;
    try {
      response = await fetch(stored.deepseekApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${stored.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "你是英文技术文档翻译助手。用户提供目标单词或术语及其所在句子。" +
                "只输出一个 JSON 对象，包含 translation（中文译文）和 explanation（一句简短技术解释）两个字段。" +
                "不要输出音标、词性或例句。",
            },
            {
              role: "user",
              content: JSON.stringify({ target: message.target, sentence: message.sentence }),
            },
          ],
        }),
      });
    } catch {
      throw new Error("网络错误，请检查网络连接");
    }
    if (!response.ok) throw new Error(`DeepSeek 返回 HTTP ${response.status}`);

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("DeepSeek 响应无法解析");
    }
    const content = extractLlmContent(data);
    if (typeof content !== "string" || !content.trim()) throw new Error("DeepSeek 响应为空");
    return { ok: true, ...parseLlmContent(content) };
  } catch (error) {
    return { ok: false, error: error?.message ?? "LLM 翻译失败" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "deepseek-translate") return false;
  void handleDeepSeekTranslate(message).then(sendResponse);
  return true;
});
