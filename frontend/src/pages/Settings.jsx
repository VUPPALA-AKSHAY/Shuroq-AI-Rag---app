import React, { useState } from 'react';
import TopHeader from '../components/TopHeader';
import { Slider } from '../components/unlumen-ui/slider';
import { useApp } from '../context/AppContext';
import { motion } from 'framer-motion';

const DEFAULT_GLM_MODEL = 'zai-glm-4.7';
const DEFAULT_RESPONSE_MODE = 'rag';
const readGlmModelPreference = () => DEFAULT_GLM_MODEL;
const readResponseModePreference = () => (
  localStorage.getItem('chatbResponseMode') === 'direct' ? 'direct' : DEFAULT_RESPONSE_MODE
);

const Settings = () => {
  const {
    user,
    updateUserProfile,
    selectedEngine,
    setSelectedEngine,
    responseMode: ctxResponseMode,
    setResponseMode: setCtxResponseMode,
    temperature: ctxTemperature,
    setTemperature: setCtxTemperature
  } = useApp();

  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');

  const [apiKeyOpenAI, setApiKeyOpenAI] = useState(user?.api_key_openai || '');
  const [apiKeyGemini, setApiKeyGemini] = useState(user?.api_key_gemini || '');

  const [defaultModel, setDefaultModel] = useState(selectedEngine);
  const [responseMode, setResponseMode] = useState(ctxResponseMode);
  const [temperature, setTemperature] = useState(ctxTemperature);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSelectedEngine(defaultModel);
    setCtxResponseMode(responseMode);
    setCtxTemperature(temperature);

    updateUserProfile({
      name: profileName,
      email: profileEmail,
      api_key_openai: apiKeyOpenAI,
      api_key_gemini: apiKeyGemini
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <>
      <TopHeader
        title="Settings"
        actionButton={
          <button
            type="submit"
            form="settings-form"
            className="bg-primary text-black font-bold px-4 py-2.5 rounded-lg text-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-lg sm:px-6"
          >
            Save Configuration
          </button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-12 w-full mx-auto space-y-8 lg:space-y-10"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary font-headline-lg">Platform Settings</h2>
          <p className="text-sm text-on-surface-variant">
            Manage your AI model configurations, API credentials, and default analytics engine options.
          </p>
        </div>

        {saveSuccess && (
          <div className="p-4 bg-white/5 border border-primary/20 text-primary font-bold text-sm rounded-lg animate-fade-in">
            Settings updated successfully! Changes applied.
          </div>
        )}

        <form id="settings-form" onSubmit={handleSave}>
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-5 lg:gap-8 items-stretch">

            <section className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow flex flex-col justify-between h-full space-y-6 lg:col-span-4">
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">vpn_key</span>
                  LLM API Credentials
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-2">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKeyOpenAI}
                      onChange={(e) => setApiKeyOpenAI(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-2">Gemini API Key</label>
                    <input
                      type="password"
                      value={apiKeyGemini}
                      onChange={(e) => setApiKeyGemini(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                    />
                  </div>

                </div>
              </div>
            </section>

            <section className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow flex flex-col justify-between h-full space-y-6 lg:col-span-2">
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">account_circle</span>
                  Profile Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-2">Full Name</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                      placeholder="e.g. Akshay Analyst"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-2">Email Address</label>
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-transparent rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary/30 transition-all duration-200"
                      placeholder="e.g. akshay@aireadyschool.com"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-panel p-5 sm:p-6 lg:p-8 rounded-xl inner-glow flex flex-col justify-between h-full space-y-6 lg:col-span-6">
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">settings_suggest</span>
                  Preferences
                </h3>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-3">Answer Model</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: 'zai-glm-4.7',
                          title: 'Cerebras ZAI GLM 4.7',
                          detail: 'High speed Cerebras inference engine with GLM.',
                        },
                        {
                          id: 'gemini-2.5-flash',
                          title: 'Gemini 2.5 Flash',
                          detail: 'Google Gemini multimodal model for general purpose.',
                        },
                      ].map((option) => (
                        <label
                          key={option.id}
                          className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition-all ${
                            defaultModel === option.id
                              ? 'border-primary bg-white/5 text-primary'
                              : 'border-white/10 text-on-surface-variant hover:border-white/30 hover:text-primary'
                          }`}
                        >
                          <input
                            type="radio"
                            name="defaultModel"
                            value={option.id}
                            checked={defaultModel === option.id}
                            onChange={() => setDefaultModel(option.id)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="block text-sm font-bold">{option.title}</span>
                            <span className="mt-1 block text-[11px] leading-5 text-on-surface-variant/70">{option.detail}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-on-surface-variant font-bold block mb-3">Response Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: 'rag',
                          title: 'RAG',
                          detail: 'Use chunks, Gemini embeddings, vector retrieval, then answer with GLM.',
                        },
                        {
                          id: 'direct',
                          title: 'Direct Model',
                          detail: 'Send selected document text directly to GLM.',
                        },
                      ].map((option) => (
                        <label
                          key={option.id}
                          className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition-all ${
                            responseMode === option.id
                              ? 'border-primary bg-white/5 text-primary'
                              : 'border-white/10 text-on-surface-variant hover:border-white/30 hover:text-primary'
                          }`}
                        >
                          <input
                            type="radio"
                            name="responseMode"
                            value={option.id}
                            checked={responseMode === option.id}
                            onChange={() => setResponseMode(option.id)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="block text-sm font-bold">{option.title}</span>
                            <span className="mt-1 block text-[11px] leading-5 text-on-surface-variant/70">{option.detail}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Slider
                      value={temperature}
                      onChange={(v) => setTemperature(v)}
                      min={0.1}
                      max={0.9}
                      step={0.1}
                      label="Temperature"
                      formatValue={(v) => `${v}`}
                      valuePosition="top"
                    />
                    <p className="text-[10px] text-on-surface-variant/60 mt-1">
                      Lower values make responses more factual and precise, higher values allow creative exploration.
                    </p>
                  </div>

                </div>
              </div>
            </section>

          </div>
        </form>
      </motion.div>
    </>
  );
};

export default Settings;

