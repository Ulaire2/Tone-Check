import React, { useState, useEffect, useRef } from 'react';
import { Settings, Check, AlertCircle, Loader2, Sparkles, Sun, Moon, Save, Trash2, Clock, X, Download, Upload, ArrowLeftRight } from 'lucide-react';

const DEFAULT_PERSONAS = [
  { id: 'Grumpy Dwarf', name: 'Grumpy Dwarf', description: 'A grumpy, rude dwarf who uses slang and hates formal language.' },
  { id: 'Noble Elf', name: 'Noble Elf', description: 'An elegant, formal elf who uses archaic words and poetic structure.' },
  { id: 'Cyberpunk Hacker', name: 'Cyberpunk Hacker', description: 'A cool, tech-savvy hacker using net-slang, leet speak, and short sentences.' },
];

const MAX_HISTORY = 50;
const HISTORY_KEY = 'check_history';
const PROVIDER_SETTINGS_KEY = 'tonecheck_provider_settings';

const PROVIDERS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', label: 'DeepSeek' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', label: 'OpenAI' },
  custom: { baseUrl: '', model: '', label: 'Custom / Local' },
};

function loadSavedPersonas() {
  try {
    const raw = localStorage.getItem('my_personas');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedPersonas(list) {
  localStorage.setItem('my_personas', JSON.stringify(list));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
}

function loadProviderSettings() {
  try {
    const raw = localStorage.getItem(PROVIDER_SETTINGS_KEY);
    if (!raw) return { provider: 'deepseek', baseUrl: PROVIDERS.deepseek.baseUrl, modelName: PROVIDERS.deepseek.model };
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider === 'openai' || parsed.provider === 'custom' ? parsed.provider : 'deepseek',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : PROVIDERS.deepseek.baseUrl,
      modelName: typeof parsed.modelName === 'string' ? parsed.modelName : PROVIDERS.deepseek.model,
    };
  } catch {
    return { provider: 'deepseek', baseUrl: PROVIDERS.deepseek.baseUrl, modelName: PROVIDERS.deepseek.model };
  }
}

function saveProviderSettings(provider, baseUrl, modelName) {
  localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify({ provider, baseUrl, modelName }));
}

/** Split AI response: first line = tier line, rest = analysis body. Robust when no newline. */
function parseResultContent(content) {
  if (content == null || typeof content !== 'string') return { tierLine: '', body: '' };
  const trimmed = content.trim();
  if (!trimmed) return { tierLine: trimmed, body: '' };
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline === -1) return { tierLine: trimmed, body: '' };
  return {
    tierLine: trimmed.slice(0, firstNewline).trim(),
    body: trimmed.slice(firstNewline + 1).trim(),
  };
}

/** Escape special regex characters in a string for use in RegExp. */
function escapeRegex(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse the "Highlighted Phrases" block from full AI response.
 * Expected format (at end of response):
 * ---
 * HIGHLIGHTS
 * Source errors: phrase1|phrase2
 * Target errors: phrase1|phrase2
 * Source tone: phrase1|phrase2
 * Target tone: phrase1|phrase2
 * ---
 * Returns { sourceErrors, targetErrors, sourceTone, targetTone } (arrays of non-empty strings).
 */
function parseHighlightedPhrases(fullContent) {
  const empty = { sourceErrors: [], targetErrors: [], sourceTone: [], targetTone: [] };
  if (fullContent == null || typeof fullContent !== 'string') return empty;
  const match = fullContent.match(/---\s*HIGHLIGHTS\s*Source errors:\s*([\s\S]*?)\s*Target errors:\s*([\s\S]*?)\s*Source tone:\s*([\s\S]*?)\s*Target tone:\s*([\s\S]*?)\s*---/i);
  if (!match) return empty;
  const splitPipe = (raw) =>
    (raw || '')
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
  return {
    sourceErrors: splitPipe(match[1].trim()),
    targetErrors: splitPipe(match[2].trim()),
    sourceTone: splitPipe(match[3].trim()),
    targetTone: splitPipe(match[4].trim()),
  };
}

/**
 * Wrap problematic phrases in text with highlight segments for React.
 * Returns array of string | { type: 'error'|'tone', text: string }.
 * Longer phrases are applied first to avoid partial overlaps.
 */
function buildHighlightSegments(text, errorPhrases, tonePhrases) {
  if (!text || typeof text !== 'string') return [];
  const ranges = []; // { start, end, type }
  const addMatches = (phrases, type) => {
    const seen = new Set();
    phrases.forEach((phrase) => {
      if (!phrase || seen.has(phrase)) return;
      seen.add(phrase);
      const escaped = escapeRegex(phrase);
      if (!escaped) return;
      const re = new RegExp(escaped, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        ranges.push({ start: m.index, end: m.index + m[0].length, type });
      }
    });
  };
  addMatches(errorPhrases, 'error');
  addMatches(tonePhrases, 'tone');
  ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      if (r.type === 'error' && last.type !== 'error') {
        last.end = r.start;
        if (last.end <= last.start) merged.pop();
        merged.push({ ...r });
      } else if (r.type === 'error' && last.type === 'error') {
        // skip duplicate error overlap
      } else if (r.type === 'tone' && last.type === 'tone') {
        last.end = Math.max(last.end, r.end);
      }
      // tone overlapping with error: skip tone
      continue;
    }
    merged.push({ ...r });
  }
  const filtered = merged.filter((m) => m.end > m.start);
  const segments = [];
  let pos = 0;
  for (const { start, end, type } of filtered) {
    if (start > pos) segments.push(text.slice(pos, start));
    segments.push({ type, text: text.slice(start, end) });
    pos = end;
  }
  if (pos < text.length) segments.push(text.slice(pos));
  return segments;
}

// Bilingual / language-agnostic labels
const t = {
  settings: 'Settings 设置',
  sourceText: 'Source Text (原文)',
  targetTranslation: 'Target Translation (译文)',
  persona: 'Persona 人设',
  targetPersona: 'Persona (人设)',
  presets: 'Presets 预设',
  mySaved: 'My Saved 我的保存',
  startCheck: 'Start Check 开始检查',
  save: 'Save 保存',
  cancel: 'Cancel 取消',
  saveChanges: 'Save Changes 保存',
  history: 'History 历史',
  clearAll: 'Clear All 清空',
  analysisReport: 'Analysis Report 分析报告',
  readyToAnalyze: 'Ready to analyze... 等待分析…',
  apiKeyPlaceholder: 'sk-...',
  apiKeyHint: 'Key is stored in your browser\'s LocalStorage. 密钥保存在浏览器本地。',
  sourcePlaceholder: 'Enter source text... 输入原文…',
  translationPlaceholder: 'Enter translation... 输入译文…',
  langDirectionEnZh: 'English ➡ Chinese',
  langDirectionZhEn: 'Chinese ➡ English',
  langDirectionNotice: '⚡ Optimized for En-Zh Game Localization. | 本工具专为英汉游戏本地化打造。',
  sourcePlaceholderEn: 'Enter English source... 输入英文原文…',
  sourcePlaceholderZh: 'Enter Chinese source... 输入中文原文…',
  translationPlaceholderEn: 'Enter Chinese translation... 输入中文译文…',
  translationPlaceholderZh: 'Enter English translation... 输入英文译文…',
  swapLabel: 'Swap 交换',
  personaPlaceholder: 'Persona description... 人设描述…',
  savePersonaPrompt: '为人设取个名字 Name for this persona:',
  errorNoApiKey: '请先点击右上角设置图标，填入 API Key Please add your API Key in Settings.',
  configureConnection: 'Configure your AI provider connection. 配置 AI 服务连接。',
  deletePersona: 'Delete this persona 删除此人设',
  saveAsPersona: 'Save as new persona 保存为新的人设',
  switchToLight: 'Switch to light 切换到浅色',
  switchToDark: 'Switch to dark 切换到深色',
  provider: 'Provider 服务商',
  apiKey: 'API Key',
  baseUrl: 'Base URL',
  modelName: 'Model 模型',
  disclaimer: 'AI-generated content. For reference only. | AI生成内容，结果仅供参考，请结合专业判断。',
  visualPreview: 'Visual Preview 高亮预览',
  sourcePreview: 'Source 原文',
  targetPreview: 'Target 译文',
  personaCacheWarning: '⚠️ 提醒：自定义人设存储在浏览器缓存中，清理缓存会导致数据丢失。 | Note: Custom personas are stored in browser cache; clearing it will result in data loss.',
  exportPersonas: 'Export Personas 导出人设',
  importPersonas: 'Import Personas 导入人设',
};

const TIER_BADGE = { s: '🏆 信达雅', a: '✨ 注入灵魂', b: '🤔 差点意思', c: '🤡 OOC', d: '💀 致命' };
const TIER_BADGE_CLASS = {
  s: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/50',
  a: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-500/50',
  b: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/50',
  c: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/50',
  d: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/50',
};

function truncate(str, len = 42) {
  if (!str || typeof str !== 'string') return '—';
  const s = str.trim();
  if (s.length <= len) return s;
  return s.slice(0, len) + '…';
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [theme, setTheme] = useState('light');
  const [langDirection, setLangDirection] = useState('en-zh');
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [persona, setPersona] = useState(DEFAULT_PERSONAS[0].id);
  const [personaDesc, setPersonaDesc] = useState(DEFAULT_PERSONAS[0].description);
  const [savedPersonas, setSavedPersonas] = useState([]);
  const [history, setHistory] = useState([]);
  const [resultTierLine, setResultTierLine] = useState('');
  const [resultBody, setResultBody] = useState('');
  const [highlightSourceErrors, setHighlightSourceErrors] = useState([]);
  const [highlightSourceTone, setHighlightSourceTone] = useState([]);
  const [highlightTargetErrors, setHighlightTargetErrors] = useState([]);
  const [highlightTargetTone, setHighlightTargetTone] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.deepseek.baseUrl);
  const [modelName, setModelName] = useState(PROVIDERS.deepseek.model);
  const importPersonasInputRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    const key = localStorage.getItem('deepseek_api_key');
    if (key) setApiKey(key);
    setSavedPersonas(loadSavedPersonas());
    setHistory(loadHistory());
    const ps = loadProviderSettings();
    setProvider(ps.provider);
    setBaseUrl(ps.baseUrl);
    setModelName(ps.modelName);
  }, []);

  const handlePersonaChange = (e) => {
    const value = e.target.value;
    setPersona(value);
    const preset = DEFAULT_PERSONAS.find((p) => p.id === value);
    if (preset) {
      setPersonaDesc(preset.description);
      return;
    }
    const saved = savedPersonas.find((p) => p.id === value);
    if (saved) setPersonaDesc(saved.description);
  };

  const isSavedPersonaSelected = savedPersonas.some((p) => p.id === persona);

  const handleSavePersona = () => {
    const name = window.prompt(t.savePersonaPrompt, 'My Persona');
    if (!name?.trim()) return;
    const id = `saved_${Date.now()}`;
    const next = [...savedPersonas, { id, name: name.trim(), description: personaDesc }];
    setSavedPersonas(next);
    saveSavedPersonas(next);
    setPersona(id);
  };

  const handleDeletePersona = () => {
    if (!isSavedPersonaSelected) return;
    const next = savedPersonas.filter((p) => p.id !== persona);
    setSavedPersonas(next);
    saveSavedPersonas(next);
    setPersona(DEFAULT_PERSONAS[0].id);
    setPersonaDesc(DEFAULT_PERSONAS[0].description);
  };

  const handleProviderChange = (p) => {
    setProvider(p);
    if (p === 'deepseek') {
      setBaseUrl(PROVIDERS.deepseek.baseUrl);
      setModelName(PROVIDERS.deepseek.model);
    } else if (p === 'openai') {
      setBaseUrl(PROVIDERS.openai.baseUrl);
      setModelName(PROVIDERS.openai.model);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('deepseek_api_key', apiKey);
    saveProviderSettings(provider, baseUrl, modelName);
    setShowSettings(false);
  };

  const handleExportPersonas = () => {
    const blob = new Blob([JSON.stringify(savedPersonas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personas_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSwap = () => {
    setSourceText((prev) => targetText);
    setTargetText((prev) => sourceText);
    setLangDirection((prev) => (prev === 'en-zh' ? 'zh-en' : 'en-zh'));
  };

  const handleImportPersonas = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result;
        if (typeof raw !== 'string') return;
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        const normalized = list
          .filter((p) => p && typeof p === 'object' && (p.name || p.description))
          .map((p, i) => ({
            id: `saved_${Date.now()}_${i}`,
            name: typeof p.name === 'string' ? p.name.trim() || 'Imported' : 'Imported',
            description: typeof p.description === 'string' ? p.description : '',
          }));
        const existingKeys = new Set(savedPersonas.map((p) => `${p.name}\n${p.description}`));
        const toAdd = normalized.filter((p) => !existingKeys.has(`${p.name}\n${p.description}`));
        if (toAdd.length === 0) return;
        const next = [...savedPersonas, ...toAdd];
        setSavedPersonas(next);
        saveSavedPersonas(next);
      } catch {
        setError('Invalid personas file. 人设文件格式无效。');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
    if (importPersonasInputRef.current) importPersonasInputRef.current.value = '';
  };

  const getTierFromResult = (text) => {
    if (!text || typeof text !== 'string') return null;
    const s = text.trim();
    if (s.includes('致命错误')) return 'd';
    if (s.includes('OOC警告')) return 'c';
    if (s.includes('差点意思')) return 'b';
    if (s.includes('注入灵魂')) return 'a';
    if (s.includes('信达雅')) return 's';
    return null;
  };

  const addToHistory = (source, target, personaId, personaDescription, fullResult, tierKey, highlights = null) => {
    const item = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      source: source,
      target: target,
      persona: personaId,
      personaDesc: personaDescription,
      result: fullResult,
      tier: tierKey,
      highlightSourceErrors: highlights?.sourceErrors ?? [],
      highlightSourceTone: highlights?.sourceTone ?? [],
      highlightTargetErrors: highlights?.targetErrors ?? [],
      highlightTargetTone: highlights?.targetTone ?? [],
    };
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const loadHistoryItem = (item) => {
    setSourceText(item.source ?? '');
    setTargetText(item.target ?? '');
    setPersona(item.persona ?? DEFAULT_PERSONAS[0].id);
    setPersonaDesc(item.personaDesc ?? DEFAULT_PERSONAS[0].description);
    const full = item.result ?? '';
    const { tierLine, body } = parseResultContent(full);
    setResultTierLine(tierLine);
    setResultBody(body);
    setHighlightSourceErrors(item.highlightSourceErrors ?? []);
    setHighlightSourceTone(item.highlightSourceTone ?? []);
    setHighlightTargetErrors(item.highlightTargetErrors ?? []);
    setHighlightTargetTone(item.highlightTargetTone ?? []);
    setShowHistory(false);
  };

  const checkTone = async () => {
    if (!apiKey) {
      setError(t.errorNoApiKey);
      return;
    }
    setLoading(true);
    setError('');
    setResultTierLine('');
    setResultBody('');
    setHighlightSourceErrors([]);
    setHighlightSourceTone([]);
    setHighlightTargetErrors([]);
    setHighlightTargetTone([]);

    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: `You are a strict Game LQA Expert. Evaluate the user's translation for meaning accuracy and character tone, then assign exactly one tier. You MUST also identify the exact phrases that are problematic so they can be highlighted.

${langDirection === 'en-zh'
  ? 'Language direction: English → Chinese (Game Loc). Focus on English-to-Chinese errors: specifically 翻译腔 (translationese), mistranslations, and failing to capture the source nuance in Chinese.'
  : 'Language direction: Chinese → English. Focus on Chinese-to-English errors: specifically Chinglish, grammar issues, and natural phrasing in English.'}

Grading rules (use exactly this logic):

- Tier S "🏆 信达雅": Perfect meaning AND the tone perfectly captures the essence/subtext of the persona.
- Tier A "✨ 注入灵魂": Correct meaning and strong, accurate character voice.
- Tier B "🤔 差点意思": Meaning is correct, but the tone is too flat, generic, or polite. (e.g., translating "I'm ready" as "我准备好了" for a warrior, instead of "刀已出鞘"). Being bland or neutral is Tier B, NOT OOC.
- Tier C "🤡 OOC警告": The tone actively CONTRADICTS the persona (e.g., a rude character using honorifics "您", "请"). Only use this when there is a clear tone contradiction—not for neutral/flat wording.
- Tier D "💀 致命错误": The translation has WRONG meaning, opposite meaning, or hallucinates information not in the source.

You MUST put the Tier Name (e.g. 🏆 信达雅 or 💀 致命错误) on the FIRST line of your response.

Output format (strictly follow):
[Tier Name]
(New line)
Reasoning: ... (brief evaluation in Chinese)
(New line)
Suggestions: ... (only if needed; omit if no changes suggested)

At the END of your response, you MUST include a "Highlighted Phrases" block so the tool can highlight problematic text. Copy the EXACT phrases from the user's Source and Target (character-for-character). Use | to separate multiple phrases on the same line. Use this exact block:

---
HIGHLIGHTS
Source errors: [exact phrases from SOURCE that correspond to mistranslation/wrong meaning, or leave empty]
Target errors: [exact phrases from TARGET that are wrong/mistranslated, or leave empty]
Source tone: [exact phrases from SOURCE that correspond to tone issues, or leave empty]
Target tone: [exact phrases from TARGET that are OOC or tone issues, or leave empty]
---

- "errors" = meaning errors, mistranslation, hallucination (Tier D). Use exact substring from user input.
- "tone" = OOC or flat tone issues (Tier B/C). Use exact substring from user input.
- If no phrase to highlight, write nothing after the colon (e.g. "Source errors: ").`,
            },
            {
              role: 'user',
              content: `Persona Description: ${personaDesc}\n\nSource Text: "${sourceText}"\n\nTarget Translation: "${targetText}"`,
            },
          ],
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const content = data.choices[0].message.content ?? '';
      const fullContent = content.trim();
      const { tierLine, body: rawBody } = parseResultContent(fullContent);
      const highlights = parseHighlightedPhrases(fullContent);
      const bodyForDisplay = rawBody.replace(/\s*---\s*HIGHLIGHTS[\s\S]*?---\s*$/i, '').trim();
      setResultTierLine(tierLine);
      setResultBody(bodyForDisplay);
      setHighlightSourceErrors(highlights.sourceErrors);
      setHighlightSourceTone(highlights.sourceTone);
      setHighlightTargetErrors(highlights.targetErrors);
      setHighlightTargetTone(highlights.targetTone);
      const tierKey = getTierFromResult(tierLine);
      if (tierKey != null) {
        const fullResult = bodyForDisplay ? `${tierLine}\n${bodyForDisplay}` : tierLine;
        addToHistory(sourceText, targetText, persona, personaDesc, fullResult, tierKey, highlights);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const hasResult = resultTierLine !== '' || resultBody !== '';
  const tier = getTierFromResult(resultTierLine);
  const tierStyles = {
    s: 'border-amber-500/70 bg-amber-50 dark:bg-amber-500/5 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10',
    a: 'border-purple-500/70 bg-purple-50 dark:bg-purple-500/5 ring-2 ring-purple-500/30 shadow-lg shadow-purple-500/10',
    b: 'border-blue-500/70 bg-blue-50 dark:bg-blue-500/5 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10',
    c: 'border-orange-500/70 bg-orange-50 dark:bg-orange-500/5 ring-2 ring-orange-500/30 shadow-lg shadow-orange-500/10',
    d: 'border-red-900 bg-red-50 dark:bg-red-950/30 ring-2 ring-red-900/40 shadow-lg shadow-red-900/20',
  };
  const tierHeaderStyles = {
    s: 'text-amber-700 dark:text-amber-400',
    a: 'text-purple-700 dark:text-purple-400',
    b: 'text-blue-700 dark:text-blue-400',
    c: 'text-orange-700 dark:text-orange-400',
    d: 'text-red-700 dark:text-red-400',
  };
  const tierLabels = { s: '🏆 信达雅', a: '✨ 注入灵魂', b: '🤔 差点意思', c: '🤡 OOC警告', d: '💀 致命错误' };
  const resultBoxClass = tier ? tierStyles[tier] : 'border-gray-200 dark:border-gray-800';
  const resultHeaderClass = tier ? tierHeaderStyles[tier] : 'text-gray-500 dark:text-gray-400';
  const tierLabel = tier ? tierLabels[tier] : null;

  const showUrlModel = provider === 'openai' || provider === 'custom';
  const canEditUrlModel = provider === 'custom';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans selection:bg-blue-500/30">
      <header className="border-b border-gray-200 dark:border-gray-800 h-16 flex justify-between items-center px-6 bg-white/80 dark:bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="text-blue-500 w-5 h-5" />
          <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-0">
            ToneCheck <span className="text-gray-400 dark:text-gray-500 mx-2 font-light">|</span> <span className="text-base font-medium text-gray-700 dark:text-gray-300">同调</span> <span className="text-xs text-gray-500 dark:text-gray-400 font-medium px-2 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-full ml-2">v1.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleTheme} className="p-2 rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white" aria-label={theme === 'dark' ? t.switchToLight : t.switchToDark}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button type="button" onClick={() => setShowHistory(true)} className="p-2 rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white" aria-label={t.history} title={t.history}>
            <Clock className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="p-2 rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white" aria-label={t.settings} title={t.settings}>
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Language Direction 语言方向</label>
            <select
              className="w-full bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100"
              value={langDirection}
              onChange={(e) => setLangDirection(e.target.value)}
            >
              <option value="en-zh">{t.langDirectionEnZh}</option>
              <option value="zh-en">{t.langDirectionZhEn}</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">{t.langDirectionNotice}</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">{t.sourceText}</label>
            <textarea
              className="w-full h-40 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
              placeholder={langDirection === 'en-zh' ? t.sourcePlaceholderEn : t.sourcePlaceholderZh}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-center -my-1">
            <button type="button" onClick={handleSwap} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors" aria-label={t.swapLabel} title={t.swapLabel}>
              <ArrowLeftRight className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">{t.targetTranslation}</label>
            <textarea
              className="w-full h-40 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl p-4 focus:ring-2 focus:ring-green-500/50 focus:border-green-500 focus:outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
              placeholder={langDirection === 'en-zh' ? t.translationPlaceholderEn : t.translationPlaceholderZh}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
            />
          </div>

          {hasResult && (
            <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.visualPreview}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t.sourcePreview}</span>
                  <div className="min-h-[4rem] p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words leading-relaxed">
                    {(() => {
                      const segments = buildHighlightSegments(sourceText, highlightSourceErrors, highlightSourceTone);
                      return segments.map((seg, i) =>
                        typeof seg === 'string' ? (
                          <React.Fragment key={i}>{seg}</React.Fragment>
                        ) : (
                          <mark key={i} className={seg.type === 'error' ? 'bg-red-500/30 rounded px-0.5' : 'bg-yellow-500/30 rounded px-0.5'}>
                            {seg.text}
                          </mark>
                        )
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t.targetPreview}</span>
                  <div className="min-h-[4rem] p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words leading-relaxed">
                    {(() => {
                      const segments = buildHighlightSegments(targetText, highlightTargetErrors, highlightTargetTone);
                      return segments.map((seg, i) =>
                        typeof seg === 'string' ? (
                          <React.Fragment key={i}>{seg}</React.Fragment>
                        ) : (
                          <mark key={i} className={seg.type === 'error' ? 'bg-red-500/30 rounded px-0.5' : 'bg-yellow-500/30 rounded px-0.5'}>
                            {seg.text}
                          </mark>
                        )
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t.targetPersona}</label>
              <div className="flex items-center gap-2">
                <select className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 min-w-[140px]" value={persona} onChange={handlePersonaChange}>
                  <optgroup label={t.presets}>
                    {DEFAULT_PERSONAS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                  {savedPersonas.length > 0 && (
                    <optgroup label={t.mySaved}>
                      {savedPersonas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {isSavedPersonaSelected && (
                  <button type="button" onClick={handleDeletePersona} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors" aria-label={t.deletePersona} title={t.deletePersona}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <textarea
                className="flex-1 min-h-[80px] bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none text-gray-800 dark:text-gray-300"
                value={personaDesc}
                onChange={(e) => setPersonaDesc(e.target.value)}
                placeholder={t.personaPlaceholder}
              />
              <button type="button" onClick={handleSavePersona} className="p-2.5 h-fit rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0" aria-label={t.saveAsPersona} title={t.saveAsPersona}>
                <Save className="w-4 h-4" />
              </button>
            </div>
            <button type="button" onClick={checkTone} disabled={loading || !apiKey} className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><Check className="w-4 h-4" /> {t.startCheck}</>}
            </button>
            {error && (
              <div className="text-red-600 dark:text-red-400 text-xs flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
          </div>

          <div className={`flex-1 bg-white dark:bg-gray-900 border rounded-xl p-6 overflow-auto transition-all duration-300 flex flex-col ${resultBoxClass}`}>
            <h3 className={`text-xs font-semibold mb-4 uppercase tracking-wider flex items-center gap-2 ${resultHeaderClass}`}>
              {tierLabel ? <span className="text-base normal-case">{tierLabel}</span> : t.analysisReport}
              {hasResult && !tierLabel && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            </h3>
            {hasResult ? (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-gray-700 dark:prose-p:text-gray-300 whitespace-pre-wrap leading-relaxed flex-1">
                {resultBody}
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-gray-500 dark:text-gray-700 gap-3 flex-1">
                <Sparkles className="w-8 h-8 opacity-20" />
                <p className="text-sm italic">{t.readyToAnalyze}</p>
              </div>
            )}
            <footer className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-500">{t.disclaimer}</p>
            </footer>
          </div>
        </div>
      </main>

      {showHistory && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowHistory(false)} aria-hidden="true" />
          <aside className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t.history}</h2>
              <button type="button" onClick={() => setShowHistory(false)} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">No history yet. 暂无记录。</p>
              ) : (
                history.map((item) => (
                  <button key={item.id} type="button" onClick={() => loadHistoryItem(item)} className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {item.tier && TIER_BADGE_CLASS[item.tier] ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TIER_BADGE_CLASS[item.tier]}`}>{TIER_BADGE[item.tier]}</span>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{formatTime(item.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{truncate(item.source, 50)}</p>
                  </button>
                ))
              )}
            </div>
            {history.length > 0 && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-800">
                <button type="button" onClick={clearHistory} className="w-full py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  {t.clearAll}
                </button>
              </div>
            )}
          </aside>
        </>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-1 text-gray-900 dark:text-white">{t.settings}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{t.configureConnection}</p>

            <div className="mb-4 space-y-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t.provider}</label>
              <select
                className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-gray-100"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                <option value="deepseek">{PROVIDERS.deepseek.label}</option>
                <option value="openai">{PROVIDERS.openai.label}</option>
                <option value="custom">{PROVIDERS.custom.label}</option>
              </select>
            </div>

            {showUrlModel && (
              <>
                <div className="mb-4 space-y-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t.baseUrl}</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-gray-900 dark:text-gray-100"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://..."
                    readOnly={!canEditUrlModel}
                    disabled={!canEditUrlModel}
                  />
                </div>
                <div className="mb-4 space-y-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t.modelName}</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-gray-900 dark:text-gray-100"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="gpt-4o / deepseek-chat / ..."
                    readOnly={provider === 'deepseek'}
                    disabled={provider === 'deepseek'}
                  />
                </div>
              </>
            )}

            <div className="mb-6 space-y-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t.apiKey}</label>
              <input
                type="password"
                className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-mono text-gray-900 dark:text-gray-100"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t.apiKeyPlaceholder}
              />
              <p className="text-xs text-gray-500 dark:text-gray-600">{t.apiKeyHint}</p>
            </div>

            <div className="mb-6 space-y-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">{t.personaCacheWarning}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleExportPersonas} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Download className="w-3.5 h-3.5" /> {t.exportPersonas}
                </button>
                <input ref={importPersonasInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportPersonas} aria-hidden="true" />
                <button type="button" onClick={() => importPersonasInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> {t.importPersonas}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                {t.cancel}
              </button>
              <button type="button" onClick={saveSettings} className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20">
                {t.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
