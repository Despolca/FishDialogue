export const DEFAULTS = Object.freeze({ baseUrl: 'https://api.fish.audio', model: 's2.1-pro-free', language: 'zh', book: 'Fish-Dialogue', defaultVoice: '', voices: {}, auto: false, fallback: false, blockEnabled: false, blockedNames: '' });
export const ENGINES = ['s2.1-pro-free', 's2.1-pro', 's2-pro', 's1', 'drama-3-preview'];

export function stripExcluded(text) {
    const mask = value => value.replace(/[^\r\n]/g, ' ');
    return String(text ?? '').replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, mask)
        .replace(/<(think|thinking|reasoning)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, mask)
        .replace(/<(script|style|pre|code|iframe|html)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, mask);
}

export function isBlocked(speaker, settings) {
    if (!settings.blockEnabled) return false;
    const names = String(settings.blockedNames || '').split(/[\n,，]/).map(x => x.trim()).filter(Boolean);
    return names.includes(String(speaker || '').trim());
}

export function blocks(text) {
    const source = stripExcluded(text), result = [];
    for (const m of source.matchAll(/<talk-emo\s*>([\s\S]*?)<\/talk-emo\s*>/gi)) {
        const parts = /^\s*([^|<>\r\n]+)\|(orig|zh|en|ja)\|([\s\S]*)$/.exec(m[1]);
        const body = parts?.[3]?.trim() || '', values = quotes(body);
        const valid = Boolean(parts && /^(?:"(?:\\.|[^"\\])*"|“[^”]*”)$/.test(body) && values.length === 1 && !/<\/?talk-emo\b/i.test(body));
        result.push({ start:m.index, end:m.index + m[0].length, raw:m[0], speaker:parts?.[1]?.trim() || '', tag:parts?.[2] || '',
            text:valid ? values[0] : '', valid, paired:true, protocol:'talk-emo', visible:'' });
    }
    result.sort((a,b) => a.start - b.start);
    result.forEach((b,i) => { b.block = i; });
    return result;
}

export function segmentFromBlock(b, language) {
    if (b?.protocol === 'talk-emo' || b?.protocol === 'plain') return b.valid ? { speaker:b.speaker, language:b.tag, text:b.text, block:b.block, paired:b.protocol==='talk-emo', protocol:b.protocol } : null;
    return null;
}

export function quotes(text) {
    const out = [];
    // A quote must close with its matching delimiter. Escaped ASCII quotes stay in the dialogue.
    const pattern = /"((?:\\.|[^"\\])*)"|“([^”]*)”/g;
    for (const m of text.matchAll(pattern)) {
        const value = (m[1] ?? m[2]).replace(/\\(["\\])/g, '$1').trim();
        if (value) out.push(value);
    }
    return out;
}

export function extract(text, { language = 'orig', speaker = '', fallback = true } = {}) {
    if (!['orig', 'zh', 'en', 'ja'].includes(language)) throw new Error('Ngôn ngữ không được hỗ trợ');
    const source = stripExcluded(text);
    const segments = [], warnings = [];
    const hasMarkers = /<\/?talk-emo\b/i.test(source);
    if (/\[\[\/?FA(?:\||\]\])/.test(source) && !hasMarkers) return {segments:[],warnings:['Định dạng FA cũ đã bị ngừng sử dụng, vui lòng sử dụng định dạng talk-emo.']};
    if (/<\/?talk\s*>/i.test(source) && !hasMarkers) return {segments:[],warnings:['Thẻ talk cũ đã bị ngừng sử dụng, vui lòng nâng cấp Worldbook sau đó tạo phản hồi mới.']};
    const records = blocks(text);
    if (hasMarkers) {
        const starts = (source.match(/<talk-emo\s*>/gi) || []).length;
        if (starts !== records.length) warnings.push('Tồn tại đoạn talk-emo chưa đóng hoặc sai định dạng, đã bỏ qua; sẽ không quay lại trích xuất toàn văn.');
        for (const b of records) {
            if (!b.valid) {
                warnings.push('Một đoạn talk-emo phải chứa chính xác một cặp dấu ngoặc kép hoàn chỉnh, đã bỏ qua.'); continue;
            }
            const segment = segmentFromBlock(b, language);
            if (segment) segments.push(segment);
        }
    } else if (fallback && language === 'orig') {
        for (const value of quotes(source)) segments.push({ speaker, language, text: value, block: segments.length, paired: false });
        if (segments.length) warnings.push('Chế độ tương thích dấu ngoặc kép thông thường: tất cả các cuộc hội thoại sử dụng nhân vật của tin nhắn hiện tại, không thể suy luận ra các nhân vật khác.');
    }
    if (!segments.length) warnings.push('Không có đoạn hội thoại ngôn ngữ đích nào có thể phát; bản dịch phải được xuất ra bởi mô hình tạo trò chuyện thông qua Worldbook.');
    if (segments.length > 100) throw new Error('Một tin nhắn vượt quá 100 đoạn hội thoại, vui lòng chia nhỏ tin nhắn');
    if (segments.some(x => Array.from(x.text).length > 2000)) throw new Error('Một câu vượt quá 2000 ký tự, vui lòng để Worldbook chia cuộc hội thoại dài thành nhiều đoạn');
    return { segments, warnings };
}

export function voiceFor(segment, settings) {
    const row = Object.hasOwn(settings.voices, segment.speaker) ? settings.voices[segment.speaker] : null;
    return (typeof row === 'string' ? row : row?.[segment.language] || row?.default) || settings.defaultVoice;
}

export function dialogueRecords(text, settings) {
    const records=blocks(text);
    if(records.length || !settings.fallback) return records;
    return extract(text,settings).segments.map(s=>({...s,tag:s.language,valid:true,protocol:'plain'}));
}

export function selectLanguage(book, language) {
    if (!['orig', 'zh', 'en', 'ja'].includes(language)) throw new Error('Ngôn ngữ không được hỗ trợ');
    const data = structuredClone(book);
    const entries = Object.values(data?.entries || {});
    if (entries.some(e => Object.values(BOOK_LANGUAGES).includes(e.comment))) {
        for (const name of Object.values(BOOK_LANGUAGES)) {
            if (entries.filter(e => e.comment === name).length !== 1) throw new Error(`Worldbook thiếu hoặc lặp lại mục: ${name}`);
        }
        for (const e of entries) if (Object.values(BOOK_LANGUAGES).includes(e.comment)) e.disable = e.comment !== BOOK_LANGUAGES[language];
        return data;
    }
    for (const name of ['FA_FORMAT', 'FA_LANG_orig', 'FA_LANG_zh', 'FA_LANG_en', 'FA_LANG_ja']) {
        if (entries.filter(e => e.comment === name).length !== 1) throw new Error(`Worldbook thiếu hoặc lặp lại mục: ${name}`);
    }
    for (const e of entries) {
        if (e.comment === 'FA_FORMAT') e.disable = false;
        if (/^FA_LANG_(orig|zh|en|ja)$/.test(e.comment)) e.disable = e.comment !== `FA_LANG_${language}`;
    }
    return data;
}

export const BOOK_LANGUAGES = Object.freeze({ zh: 'FA_FORMAT · Tiếng Trung', ja: 'FA_FORMAT · Tiếng Nhật', en: 'FA_FORMAT · Tiếng Anh' });

export function upgradeWorldbook(old, template, language) {
    selectLanguage(template, language);
    if (!old?.entries || typeof old.entries !== 'object') throw new Error('Định dạng Worldbook cũ bị lỗi');
    const data = structuredClone(old);
    const managed = name => Object.values(BOOK_LANGUAGES).includes(name) || /^(FA_FORMAT|FA_LANG_(orig|zh|en|ja))$/.test(name);
    for (const [key, entry] of Object.entries(data.entries)) if (managed(entry.comment)) delete data.entries[key];
    for (const entry of Object.values(template.entries)) {
        let uid = 0;
        while (Object.hasOwn(data.entries, uid) || Object.values(data.entries).some(e => e.uid === uid)) uid++;
        data.entries[uid] = { ...structuredClone(entry), uid };
    }
    return selectLanguage(data, language);
}