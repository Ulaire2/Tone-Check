import React, { useState, useEffect } from 'react';
import { Settings, Check, AlertCircle, Loader2, Sparkles, Sun, Moon, Save, Trash2, Clock, X } from 'lucide-react';

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
  if (!trimmed) return { tierLine: '', body: '' };
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline === -1) return { tierLine: trimmed, body: '' };
  return {
    tierLine: trimmed.slice(0, firstNewline).trim(),
    body: trimmed.slice(firstNewline + 1).trim(),
  };
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
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [persona, setPersona] = useState(DEFAULT_PERSONAS[0].id);
  const [personaDesc, setPersonaDesc] = useState(DEFAULT_PERSONAS[0].description);
  const [savedPersonas, setSavedPersonas] = useState([]);
  const [history, setHistory] = useState([]);
  const [resultTierLine, setResultTierLine] = useState('');
  const [resultBody, setResultBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.deepseek.baseUrl);
  const [modelName, setModelName] = useState(PROVIDERS.deepseek.model);

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

  const addToHistory = (source, target, personaId, personaDescription, fullResult, tierKey) => {
    const item = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      source: source,
      target: target,
      persona: personaId,
      personaDesc: personaDescription,
      result: fullResult,
      tier: tierKey,
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
              content: `You are a strict Game LQA Expert. Evaluate the user's translation for meaning accuracy and character tone, then assign exactly one tier.

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
Suggestions: ... (only if needed; omit if no changes suggested)`,
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
      const { tierLine, body } = parseResultContent(content);
      setResultTierLine(tierLine);
      setResultBody(body);
      const tierKey = getTierFromResult(tierLine);
      if (tierKey != null) {
        const fullContent = body ? `${tierLine}\n${body}` : tierLine;
        addToHistory(sourceText, targetText, persona, personaDesc, fullContent, tierKey);
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
          <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            ToneCheck <span className="text-xs text-gray-500 dark:text-gray-400 font-medium px-2 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-full">v1.6</span>
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
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">{t.sourceText}</label>
            <textarea
              className="w-full h-40 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
              placeholder={t.sourcePlaceholder}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">{t.targetTranslation}</label>
            <textarea
              className="w-full h-40 bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl p-4 focus:ring-2 focus:ring-green-500/50 focus:border-green-500 focus:outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
              placeholder={t.translationPlaceholder}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
            />
          </div>
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
