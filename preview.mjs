export function defaultVoicePreview(settings) {
    if (!settings.defaultVoice?.trim()) throw new Error('Vui lòng điền ID giọng nói mặc định trước');
    const samples = {
        orig: 'Xin chào, đây là bản nghe thử giọng nói mặc định.', zh: '你好，这是默认音色试听。',
        en: 'Hello, this is a preview of the default voice.',
        ja: 'こんにちは。これはデフォルト音声の試聴です。',
    };
    return { text: samples[settings.language] || samples.zh, speaker: '',
        language: settings.language === 'orig' ? 'zh' : settings.language,
        voice: settings.defaultVoice.trim(), model: settings.model,
        baseUrl: settings.baseUrl, preview: true };
}