// Only AI chat history at prompt construction, never the stored message or worldbook.
export const PROMPT_REGEX = Object.freeze({
    id: '825e6192-4033-4d69-82e2-edc8acb96781',
    scriptName: 'Fish Dialogue: Talk-Emo không gửi cho LLM',
    findRegex: '/<Talk-Emo\\s*>[\\s\\S]*?(?:<\\/Talk-Emo\\s*>|$)/gi',
    replaceString: '', trimStrings: [], placement: [2],
    disabled: false, markdownOnly: false, promptOnly: true,
    runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null,
});

export function upsertPromptRegex(scripts) {
    if (!Array.isArray(scripts)) throw new Error('Cài đặt regex của tửu quán không phải là danh sách hợp lệ, không sửa đổi cài đặt gốc');
    const next = scripts.filter(s => s.id !== PROMPT_REGEX.id);
    next.push(structuredClone(PROMPT_REGEX));
    return next;
}

export async function installPromptRegex(context, loadEngine = () => import('/scripts/extensions/regex/engine.js')) {
    if (context.extensionSettings.disabledExtensions?.includes('regex')) {
        throw new Error('Tiện ích mở rộng regex của tửu quán đã bị tắt, vui lòng bật lên trước, sau đó nhấp vào thêm regex');
    }
    let engine;
    try { engine = await loadEngine(); }
    catch { throw new Error('Không thể tải giao diện regex của tửu quán; có thể nhập thủ công Talk-Emo-prompt-regex.json trong gói cài đặt tại tiện ích mở rộng regex'); }
    if (!engine.getScriptsByType || !engine.saveScriptsByType || engine.SCRIPT_TYPES?.GLOBAL === undefined) {
        throw new Error('Phiên bản giao diện regex của tửu quán không hỗ trợ tự động thêm, vui lòng nhập thủ công Talk-Emo-prompt-regex.json');
    }
    const type = engine.SCRIPT_TYPES.GLOBAL;
    await engine.saveScriptsByType(upsertPromptRegex(engine.getScriptsByType(type)), type);
}