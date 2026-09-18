import { DEFAULTS, extract, voiceFor, selectLanguage, upgradeWorldbook, blocks, dialogueRecords, segmentFromBlock, isBlocked } from './core.mjs';
import { SpeechQueue } from './player.mjs';
import { SynthesisQueue } from './synthesis.mjs';
import { installInline } from './inline.mjs';
import { installPromptRegex } from './prompt-regex.mjs';
import { defaultVoicePreview } from './preview.mjs';

const ctx = () => SillyTavern.getContext();
const KEY = 'fish_dialogue_v1';
const settings = ctx().extensionSettings[KEY] = { ...structuredClone(DEFAULTS), ...ctx().extensionSettings[KEY] };
if (settings.schemaVersion !== 110) {
    settings.fallback = false;
    settings.schemaVersion = 110;
    ctx().saveSettingsDebounced();
}
let apiKey = settings.savedApiKey || ''; // Saved only on explicit user action.
const audio = new Audio(); audio.preload = 'auto';
const logs = [], seen = new Map();
let worldModule;
let inline, libraryEntries = [];
const root = document.createElement('section'); root.id = 'fish-dialogue';
root.innerHTML = `
<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header" role="button" tabindex="0"><b>Fish Âm thanh đối thoại</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><small>Phiên bản 1.4.3</small>
<div class="fa-status" id="fa-status">Đã sẵn sàng</div>
<label class="checkbox_label"><input id="fa-auto" type="checkbox"> Tự động lồng tiếng cho phản hồi mới</label><small>Tạo lời thoại theo thứ tự và lưu cục bộ, không tự động phát.</small>
<div class="fa-row"><button id="fa-latest">Tạo âm thanh theo số thứ tự trò chuyện</button></div>
<label>Số thứ tự văn bản trò chuyện (Để trống là phản hồi mới nhất)<input id="fa-message" type="number" min="0" class="text_pole"></label>
<details open><summary>Cài đặt kết nối</summary>
<label>Base URL (Địa chỉ gốc của dịch vụ, có thể thêm /v1 ở cuối)<input id="fa-base" class="text_pole"></label>
<label>API Key<input id="fa-key" class="text_pole" type="password" autocomplete="off"></label>
<button id="fa-key-save">Lưu API KEY</button><small>Lưu vào cài đặt tài khoản; lưu trống có thể xóa. Bản sao lưu cài đặt tài khoản có thể chứa khóa này.</small>
<label>Engine giọng nói<input id="fa-model" class="text_pole" type="text" placeholder="s2.1-pro-free"></label>
<div class="fa-row"><button id="fa-health">Kiểm tra proxy tửu quán</button></div>
</details>
<details open><summary>Ngôn ngữ và Worldbook</summary>
<label>Tên Worldbook chuyên dụng<input id="fa-book" class="text_pole"></label>
<label>Ngôn ngữ đầu ra<select id="fa-language"><option value="orig">Văn bản gốc (Đóng Worldbook lồng tiếng)</option><option value="zh">Tiếng Trung</option><option value="en">Tiếng Anh</option><option value="ja">Tiếng Nhật</option></select></label>
<div class="fa-row"><button id="fa-apply-language">Áp dụng ngôn ngữ</button><button id="fa-install-book">Cài đặt / Gắn Worldbook</button><button id="fa-upgrade-book">Nâng cấp Worldbook</button><button id="fa-add-regex">Thêm Regex</button></div>
<small>Lựa chọn ngôn ngữ sẽ có hiệu lực sau khi "Áp dụng" thành công; chỉ thay đổi prompt của lần tạo trò chuyện tiếp theo, tin nhắn cũ sẽ không tự động dịch. Gắn làm Worldbook toàn cục, mục ngôn ngữ được chia sẻ cho tất cả các cuộc trò chuyện của tài khoản này.</small>
<label class="checkbox_label"><input id="fa-fallback" type="checkbox"> Tương thích với dấu ngoặc kép thông thường khi không có thẻ</label>
</details>
<details open><summary>Giọng nói nhân vật</summary>
<div class="fa-default-heading"><label for="fa-default">ID giọng nói mặc định</label><button id="fa-preview-default" type="button">Nghe thử giọng mặc định</button></div><input id="fa-default" class="text_pole">
<label class="checkbox_label"><input id="fa-block-enabled" type="checkbox"> Bật chặn nhân vật</label>
<label>Tên nhân vật bị chặn (Mỗi dòng một tên, khớp chính xác)<textarea id="fa-block-names" class="text_pole" rows="2" placeholder="Ví dụ: Tên nhân vật bị chặn"></textarea></label>
<small>Chặn chỉ ảnh hưởng đến âm thanh, lời thoại tiếng Trung vẫn hiển thị bình thường. Dừng ngay hàng đợi hiện tại sau khi sửa đổi.</small>
<small>Tên nhân vật phải hoàn toàn khớp với đầu ra của Worldbook; âm thanh trống sử dụng giọng nói mặc định.</small>
<div id="fa-voices"></div><button id="fa-add">Thêm nhân vật</button><button id="fa-save-voices">Lưu liên kết nhân vật</button>
</details>
<details><summary>Tiến trình tổng hợp / Âm thanh đã tạo <span class="fa-version">Lưu cục bộ</span></summary>
<div id="fa-progress-summary" role="status">Chưa có nhiệm vụ tổng hợp</div><progress id="fa-progress-bar" max="1" value="0"></progress>
<div class="fa-row"><button id="fa-cancel-generation">Hủy hàng đợi tổng hợp</button></div>
<small>Số byte lấy từ lượng nhận thực tế của máy chủ. Không hiển thị tỷ lệ phần trăm ảo khi upstream không cung cấp tổng độ dài.</small><div id="fa-progress-list"></div>
<div class="fa-row"><button id="fa-library-refresh">Làm mới danh sách âm thanh</button><button id="fa-folder">Mở thư mục cục bộ</button></div>
<small id="fa-library-path">Lưu trên máy tính đang chạy tửu quán, cách ly theo tài khoản tửu quán.</small>
<label>Số lượng giữ lại tối đa (1–10000)<input id="fa-limit" type="number" min="1" max="10000" value="200" class="text_pole"></label>
<button id="fa-limit-save">Lưu số lượng và dọn dẹp các âm thanh cũ nhất bị vượt quá</button>
<small>Chỉ dọn dẹp các tệp do plugin này lưu. Các câu bị dọn dẹp có thể được tạo lại khi nhấp vào lần nữa.</small>
<div id="fa-library-list"></div>
</details>
<details><summary>Nhật ký</summary><div class="fa-row"><button id="fa-log-export">Xuất nhật ký</button><button id="fa-log-clear">Xóa nhật ký</button></div><pre id="fa-logs"></pre></details>
</div></div>`;
(document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings') || document.body).append(root);
for (const button of root.querySelectorAll('button')) button.classList.add('menu_button');
root.querySelector('.inline-drawer-header').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.currentTarget.click();}});
const $ = id => id === 'audio' ? audio : root.querySelector('#fa-' + id);
function save() { ctx().saveSettingsDebounced(); }
function log(level, text) {
    let safe = String(text);
    for (const key of [apiKey,settings.savedApiKey]) if(key) safe = safe.replaceAll(key, '[REDACTED]');
    safe = safe.replace(/sk-fish-[A-Za-z0-9_-]+/g,'[REDACTED]');
    logs.push(`${new Date().toISOString()} ${level} ${safe}`);
    if (logs.length > 300) logs.shift();
    $('logs').textContent = logs.join('\n');
    if (level === 'ERROR' || level === 'WARN') $('status').textContent = safe;
    if (level === 'ERROR') showError(safe);
}
let lastError = '', lastErrorAt = 0;
function showError(message) {
    if (message === lastError && Date.now()-lastErrorAt < 4000) return;
    lastError=message; lastErrorAt=Date.now();
    const dialog=document.createElement('dialog'); dialog.className='fa-error-dialog';
    const title=document.createElement('h3'); title.textContent='Fish Âm thanh đối thoại: Đã xảy ra lỗi';
    const body=document.createElement('p'); body.textContent=message;
    const close=document.createElement('button'); close.className='menu_button'; close.textContent='Đóng'; close.onclick=()=>dialog.close();
    dialog.append(title,body,close); document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function click(id, fn) {
    $(id).addEventListener('click', async () => {
        $(id).disabled = true;
        try { await fn(); } catch (e) { log('ERROR', e.message); }
        finally { $(id).disabled = false; }
    });
}
async function api(action, input = {}, signal) {
    const r = await fetch('/api/plugins/fish-dialogue/' + action, {
        method: 'POST', headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ baseUrl: settings.baseUrl, ...(['tts', 'voices', 'engines'].includes(action) ? { apiKey } : {}), ...input }), signal,
    });
    if (!r.ok) {
        let data; try { data = await r.json(); } catch { /* HTML 404 on missing bridge */ }
        throw new Error(data?.error || `HTTP cầu nối tửu quán ${r.status}; nếu là 404, vui lòng nhấp đúp vào install-server.cmd trong thư mục tiện ích mở rộng để cài đặt máy chủ, sau đó khởi động lại hoàn toàn tửu quán`);
    }
    if (action === 'tts' || action === 'audio') {
        const blob = await r.blob();
        if (action === 'tts') { input.assetId = r.headers.get('X-Fish-Audio-Id'); input.cacheSource = r.headers.get('X-Fish-Cache'); }
        return blob;
    }
    return r.json();
}
const generator = new SynthesisQueue({synthesize:synthesizeRaw, changed:renderProgress});
function renderProgress() {
    const tasks = generator.tasks;
    for(const task of tasks) if(task.status==='failed' && !task.errorReported){task.errorReported=true;log('ERROR',task.error);}
    const counts = {ready:0,failed:0,canceled:0};
    for(const t of tasks) if(t.status in counts) counts[t.status]++;
    $('progress-summary').textContent = tasks.length ? 'Đã sẵn sàng '+counts.ready+' / '+tasks.length+' · Thất bại '+counts.failed+' · Đã hủy '+counts.canceled+(generator.memoryPaused?' · Bộ đệm đã đầy, tiếp tục tổng hợp sau khi phát':'') : 'Chưa có nhiệm vụ tổng hợp';
    $('progress-bar').max=Math.max(1,tasks.length); $('progress-bar').value=counts.ready+counts.failed+counts.canceled;
    const rows=tasks.slice(-100).map(t=>{
        const row=document.createElement('div');row.className='fa-job';
        const title=document.createElement('span');title.textContent=(t.item.speaker||'Mặc định')+' · Đoạn '+(t.item.block||0+1);
        const state=document.createElement('small');
        const labels={queued:'Chờ yêu cầu',requesting:'Chờ phản hồi API',receiving:'Đang nhận âm thanh',saving:'Đang lưu âm thanh',ready:t.cacheSource==='disk'?'Trúng bộ nhớ cache cục bộ':'Âm thanh đã sẵn sàng',failed:'Thất bại',canceled:'Đã hủy'};
        const elapsed=t.startedAt?Math.max(0,Math.round(((t.finishedAt||Date.now())-t.startedAt)/1000)):0;
        const bytes=t.receivedBytes ? ' · '+(t.receivedBytes/1024).toFixed(1)+' KB'+(t.totalBytes?' / '+(t.totalBytes/1024).toFixed(1)+' KB':' (Chưa rõ tổng kích thước)'):'';
        state.textContent=labels[t.status]+' · '+elapsed+' giây'+bytes+(t.error?' · '+t.error:'');
        row.append(title,state);return row;
    });
    $('progress-list').replaceChildren(...rows);inline?.schedule();
}
function stopAll() { generator.cancel(); queue.stop(); }
click('cancel-generation',()=>generator.cancel());
const progressTimer=setInterval(()=>{if(generator.running)renderProgress();},1000);
const queue = new SpeechQueue({
    audio: $('audio'), log,
    changed(q) {
        $('status').textContent = q.error || (q.running ? `Nhân vật: ${q.current?.speaker || 'Mặc định'} · Còn lại ${q.items.length} câu${q.paused ? ' · Đã tạm dừng' : ''}` : 'Đã sẵn sàng / Hàng đợi kết thúc');
        $('preview-default').textContent=q.running && q.current?.preview?'Dừng nghe thử':'Nghe thử giọng mặc định';
        inline?.schedule();
    },
    async synthesize(item, signal) {
        if (isBlocked(item.speaker, settings)) throw new Error('Nhân vật này đã bị chặn');
        if (item.libraryId) return api('audio', {id:item.libraryId}, signal);
        item.task ||= generator.submit(item);
        return generator.take(item.task, signal);
    },
});
click('preview-default',()=>{
    if(queue.running && queue.current?.preview){queue.stop();return;}
    const item=defaultVoicePreview(settings);queue.stop();queue.enqueue([item]);
});
async function synthesizeRaw(item, signal, update) {
        if (isBlocked(item.speaker, settings)) throw new Error('Nhân vật này đã bị chặn, sẽ không gửi lời thoại đến API');
        
        // Message identities are persisted only when audio is requested, not during rendering.
        if (item.messageRef) {
            const c = ctx();
            if (!c.chat.includes(item.messageRef)) throw new Error('Tin nhắn đã được chuyển đổi, hủy tạo');
            const needsSave = !c.chatMetadata.fish_dialogue_chat_id || !item.messageRef.extra?.fish_dialogue?.id;
            c.chatMetadata.fish_dialogue_chat_id ||= (globalThis.crypto?.randomUUID?.() || c.uuidv4());
            item.messageRef.extra ||= {};
            item.messageRef.extra.fish_dialogue ||= {};
            item.messageRef.extra.fish_dialogue.id ||= (globalThis.crypto?.randomUUID?.() || c.uuidv4());
            item.messageRef.extra.fish_dialogue.language ||= item.language;
            const revision = await digest(item.messageRef.mes);
            item.link = { chat: c.chatMetadata.fish_dialogue_chat_id, message: item.messageRef.extra.fish_dialogue.id, revision, block: item.block };
            if (needsSave) await c.saveChat();
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        }
        const payload = { text: item.text, speaker: item.speaker, language: item.language, voice: item.voice,
            model: item.model, baseUrl: item.baseUrl, link: item.link, persist: true, jobId: globalThis.crypto?.randomUUID?.() || ctx().uuidv4() };
        // Disk is authoritative for retention; local cache is not used to recreate a deleted file.
        const start = performance.now();
        log('INFO', `Đọc hoặc tổng hợp: ${item.model}, ${Array.from(item.text).length} ký tự`);
        let active = true, timer; const polling = new AbortController();
        const poll = async () => {
            try {
                const data = await api('progress', {jobId:payload.jobId}, polling.signal);
                if(active && data.job) {
                    const patch = {receivedBytes:data.job.receivedBytes,totalBytes:data.job.totalBytes};
                    if(['requesting','receiving','saving'].includes(data.job.status)) patch.status=data.job.status;
                    update(patch);
                }
            } catch { /* Transient progress polling failures do not cancel synthesis. */ }
            finally { if(active) timer=setTimeout(poll,750); }
        };
        timer=setTimeout(poll,250);
        let blob;
        try { blob = await api('tts', payload, signal); }
        finally { active=false; clearTimeout(timer); polling.abort(); }
        update({cacheSource:payload.cacheSource});
        item.assetId = payload.assetId;
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        log('INFO', `${payload.cacheSource === 'disk' ? 'Trúng bộ nhớ cache âm thanh cục bộ' : 'Tổng hợp và lưu hoàn tất'}: ${Math.round(performance.now() - start)} ms, ${blob.size} byte`);
        return blob;
}

function source() {
    const chat = ctx().chat;
    const val = $('message').value;
    const id = val === '' ? chat.findLastIndex(m => !m.is_user && !m.is_system) : Number(val);
    const message = chat[id];
    if (!Number.isInteger(id) || !message || message.is_user || message.is_system) throw new Error('Không có tin nhắn AI nào có thể phát');
    return { id, message };
}
async function digest(text) {
    if (globalThis.crypto?.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
    // LAN HTTP can lack WebCrypto. This is only a revision hint; the server hashes exact speech and identity.
    let a = 2166136261, b = 5381;
    for (const ch of String(text)) { a = Math.imul(a ^ ch.codePointAt(0), 16777619); b = Math.imul(b, 33) ^ ch.codePointAt(0); }
    return `local-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}
function parsed(text, speaker, language = settings.language) {
    const result = extract(text, { ...settings, language, speaker });
    result.warnings.forEach(w => log('WARN', w));
    log('INFO', `Đã trích xuất ${result.segments.length} đoạn hội thoại ${settings.language}`);
    const allowed = result.segments.filter(s => !isBlocked(s.speaker, settings));
    if (allowed.length !== result.segments.length) log('INFO', `Chặn nhân vật: Bỏ qua ${result.segments.length - allowed.length} đoạn, không gửi API`);
    return allowed;
}
function enqueue(segments, replace = false, eager = false) {
    const items = segments.filter(s => !isBlocked(s.speaker, settings)).map(s => ({ ...s, voice: voiceFor(s, settings), model: settings.model, baseUrl: settings.baseUrl }));
    if (items.some(x => !x.voice)) throw new Error('Có nhân vật chưa liên kết ID giọng nói, và không có giọng nói mặc định; vui lòng điền ID giọng nói trước');
    if (!items.length) return;
    if (queue.items.length + items.length > 100 && !replace) throw new Error('Hàng đợi chờ vượt quá 100 câu, vui lòng phát hoặc dừng trước');
    if (replace) queue.stop();
    if (eager) for (const item of items) item.task = generator.submit(item);
    queue.enqueue(items);
}
function bind(id, name, checkbox = false) {
    $(id)[checkbox ? 'checked' : 'value'] = settings[name];
    $(id).addEventListener(checkbox ? 'change' : 'input', () => {
        const value = checkbox ? $(id).checked : $(id).value.trim();
        settings[name] = value; save();
        if (['baseUrl', 'model', 'defaultVoice'].includes(name)) stopAll();
        if (name === 'auto' && !value) stopAll();
        if (name === 'blockEnabled' || name === 'blockedNames' || name === 'fallback') { stopAll(); inline?.schedule(); }
    });
}
bind('auto', 'auto', true); bind('fallback', 'fallback', true);
bind('block-enabled', 'blockEnabled', true); bind('block-names', 'blockedNames');
if (typeof settings.model !== 'string' || !settings.model.trim()) { settings.model=DEFAULTS.model; save(); }
bind('base', 'baseUrl'); bind('model', 'model'); bind('book', 'book'); bind('default', 'defaultVoice');
$('language').value = settings.language;
$('key').value=apiKey;
$('key').addEventListener('input', () => { stopAll(); apiKey = $('key').value.trim(); });
click('key-save',()=>{settings.savedApiKey=apiKey;save();log('INFO',apiKey?'API Key đã được lưu vào cài đặt tài khoản':'Đã xóa API Key đã lưu');});
click('add-regex',async()=>{await installPromptRegex(ctx());log('INFO','Đã thêm Regex lọc prompt Talk-Emo; có hiệu lực ngay lập tức, sau khi làm mới có thể xem trong danh sách regex của tửu quán.');$('status').textContent='Đã thêm Regex: Các đoạn âm thanh sẽ không được gửi đến LLM nữa, văn bản trò chuyện gốc và chức năng phát được giữ lại';});
function addVoice(name = '', voice = '') {
    const row = document.createElement('div'); row.className = 'fa-voice';
    const nameInput = document.createElement('input'); nameInput.placeholder = 'Tên nhân vật'; nameInput.value = name;
    const voiceInput = document.createElement('input'); voiceInput.placeholder = 'ID giọng nói'; voiceInput.value = voice;
    const remove = document.createElement('button'); remove.textContent = 'Xóa'; remove.onclick = () => row.remove();
    row.append(nameInput, voiceInput, remove); $('voices').append(row);
}
Object.entries(settings.voices).forEach(([name, voice]) => addVoice(name, typeof voice === 'string' ? voice : voice.default || ''));
click('add', () => addVoice());
click('save-voices', () => {
    const voices = Object.create(null);
    for (const row of $('voices').children) {
        const [name, voice] = [...row.querySelectorAll('input')].map(x => x.value.trim());
        if (!name && !voice) continue;
        if (!name || Object.hasOwn(voices, name)) throw new Error('Tên nhân vật không được để trống hoặc lặp lại');
        voices[name] = voice;
    }
    stopAll(); settings.voices = voices; save(); log('INFO', 'Đã lưu liên kết nhân vật');
});
function generateMessage(message) {
    const id=ctx().chat.indexOf(message);
    const items=parsed(message.mes,message.name || ctx().name2,message.extra?.fish_dialogue?.language || settings.language)
        .map(s=>({...s,messageRef:message,uiKey:id+':'+s.block,voice:voiceFor(s,settings),model:settings.model,baseUrl:settings.baseUrl}));
    if(items.some(x=>!x.voice)) throw new Error('Vui lòng điền ID giọng nói mặc định hoặc ID giọng nói nhân vật trước');
    for(const item of items) generator.submit(item,{retainAudio:false});
}
click('latest',()=>generateMessage(source().message));
$('audio').addEventListener('play',()=>{queue.paused=false;});
click('health', async () => {
    const r = await fetch('/api/plugins/fish-dialogue/health', { headers: ctx().getRequestHeaders() });
    if (!r.ok) throw new Error('Không tìm thấy cầu nối máy chủ. GitHub chỉ cài đặt frontend; vui lòng nhấp đúp vào install-server.cmd trong thư mục tiện ích mở rộng Fishdialogue, sau khi hoàn tất hãy khởi động lại hoàn toàn tửu quán. enableServerPlugins bắt buộc phải là true.');
    const h = await r.json();
    log(h.configured ? 'INFO' : 'ERROR', h.configured ? `Cầu nối ${h.version}, đã phát hiện proxy toàn cục của tửu quán ${h.agent}. Vui lòng nghe thử để kiểm chứng kết nối thực tế.` : 'Không phát hiện proxy toàn cục của tửu quán, vui lòng kiểm tra requestProxy');
});
async function world() { return worldModule ||= await import('/scripts/world-info.js'); }
async function writeBook(name, data) {
    const w = await world();
    const r = await fetch('/api/worldinfo/edit', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ name, data }) });
    if (!r.ok) throw new Error(`Lưu Worldbook thất bại: HTTP ${r.status}`);
    w.worldInfoCache.set(name, data);
    await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_UPDATED, name, data);
    w.reloadEditor(name);
}
async function applyLanguage() {
    const w = await world(), name = settings.book;
    if (!w.world_names.includes(name)) throw new Error('Vui lòng cài đặt Worldbook trước');
    const data = await w.loadWorldInfo(name);
    await writeBook(name, selectLanguage(data, $('language').value));
    stopAll(); settings.language = $('language').value; save();
    inline?.refresh();
    log('INFO', `Ngôn ngữ Worldbook đã được chuyển thành ${settings.language}; có hiệu lực đối với các lần tạo trò chuyện tiếp theo`);
}
click('apply-language', applyLanguage);
click('install-book', async () => {
    const w = await world(), name = settings.book;
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('Vui lòng điền tên Worldbook hợp lệ');
    if (!w.world_names.includes(name)) {
        const r = await fetch(new URL('./Fish-Dialogue.json', import.meta.url));
        if (!r.ok) throw new Error('Thư mục tiện ích mở rộng thiếu Fish-Dialogue.json');
        await writeBook(name, selectLanguage(await r.json(), $('language').value));
        await w.updateWorldInfoList();
    } else await applyLanguage();
    const options = [...document.querySelectorAll('#world_info option')];
    const option = options.find(o => o.textContent === name);
    if (!option) throw new Error('Worldbook đã được lưu, nhưng không tìm thấy control gắn kết; vui lòng chọn thủ công trong trang Worldbook');
    option.selected = true; window.jQuery('#world_info').trigger('change');
    settings.language = $('language').value; save();
    log('INFO', `Đã gắn Worldbook ${name}; các Worldbook khác giữ nguyên lựa chọn cũ`);
});
click('upgrade-book', async () => {
    const w = await world(), name = settings.book;
    if (!w.world_names.includes(name)) throw new Error('Vui lòng cài đặt Worldbook trước');
    const old = await w.loadWorldInfo(name);
    const r = await fetch(new URL('./Fish-Dialogue.json', import.meta.url));
    if (!r.ok) throw new Error('Thiếu tệp Worldbook phiên bản mới');
    const template = await r.json();
    const upgraded = upgradeWorldbook(old, template, $('language').value);
    const backup = `${name}-backup-${Date.now()}`;
    await writeBook(backup, structuredClone(old));
    await writeBook(name, selectLanguage(upgraded, $('language').value));
    await w.updateWorldInfoList();
    stopAll(); settings.language = $('language').value; save(); inline?.refresh();
    log('INFO', `Worldbook đã được nâng cấp thành hiển thị tiếng Trung + định dạng âm thanh ẩn. Bản sao lưu sách cũ: ${backup}`);
    $('status').textContent = 'Worldbook đã được nâng cấp và sao lưu; vui lòng tạo một phản hồi mới để kiểm tra';
});
function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
click('log-export', () => download(new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' }), 'fish-dialogue-log.txt'));
click('log-clear', () => { logs.length = 0; $('logs').textContent = ''; });
async function refreshLibrary() {
    const data = await api('library'); libraryEntries = data.entries;
    $('library-path').textContent = `${data.path} · ${data.entries.length} / ${data.maxFiles} tệp âm thanh`;
    $('limit').value = data.maxFiles;
    const list = $('library-list'); list.replaceChildren();
    for (const entry of data.entries.slice(0, 100)) {
        const row = document.createElement('div'); row.className = 'fa-library-item';
        const info = document.createElement('span');
        info.textContent = `${entry.speaker} · Đoạn ${(entry.link?.block || 0) + 1} · ${entry.language} · ${new Date(entry.createdAt).toLocaleString()} · ${Math.round(entry.bytes / 1024)} KB`;
        const down = document.createElement('button'); down.textContent = 'Tải xuống';
        down.onclick = async () => { try { download(await api('audio', { id: entry.id }), `${entry.id}.mp3`); } catch (e) { log('ERROR', e.message); } };
        const filename = document.createElement('small'); filename.textContent = `${entry.id}.mp3`;
        row.append(info, down, filename); list.append(row);
    }
    if (data.entries.length > 100) { const note = document.createElement('small'); note.textContent = 'Bảng điều khiển hiển thị 100 tệp gần nhất, toàn bộ tệp có thể xem trong thư mục cục bộ.'; list.append(note); }
    log('INFO', `Thư viện giọng nói: ${data.entries.length} tệp, giới hạn ${data.maxFiles}`);
}
click('library-refresh', refreshLibrary);
click('limit-save', async () => {
    stopAll();
    const result = await api('library/limit', { maxFiles: Number($('limit').value) });
    await refreshLibrary(); log('INFO', `Đã lưu giới hạn giữ lại, dọn dẹp ${result.removed} âm thanh cũ nhất`);
});
click('folder', async () => { const result = await api('library/open'); $('library-path').textContent = result.path; log('INFO', 'Đã yêu cầu mở thư mục âm thanh trên máy tính tửu quán'); });

inline = installInline({ context: ctx, settings, log, progress: key => generator.tasks.findLast(t => t.item.uiKey === key), pause: () => queue.pause(), resume: () => queue.resume(),
    current: () => ({ uiKey: queue.current?.uiKey, running: queue.running, paused: queue.paused, phase: queue.phase }),
    async play(id, ordinal) {
        const message = ctx().chat[id];
        const segment = segmentFromBlock(dialogueRecords(message.mes,{...settings,speaker:message.name || ctx().name2})[ordinal], message.extra?.fish_dialogue?.language || settings.language);
        if (!segment || isBlocked(segment.speaker, settings)) return;
        enqueue([{ ...segment, messageRef: message, uiKey: `${id}:${ordinal}` }], true);
    },
});

const c = ctx();
let generationLanguage = settings.language;
if (c.eventTypes.GENERATION_STARTED) c.eventSource.on(c.eventTypes.GENERATION_STARTED, () => { generationLanguage = settings.language; });
c.eventSource.on(c.eventTypes.CHARACTER_MESSAGE_RENDERED, async (id, type) => {
    const message = ctx().chat[id];
    if (!message || message.is_user || message.is_system) return;
    if (type !== 'first_message' && type !== 'quiet' && blocks(message.mes).some(b => b.paired)) {
        message.extra ||= {}; message.extra.fish_dialogue ||= {};
        message.extra.fish_dialogue.language = generationLanguage;
        try { await ctx().saveChat(); } catch { log('WARN', 'Lưu siêu dữ liệu ngôn ngữ tin nhắn thất bại'); }
    }
    inline.schedule();
    if (!settings.auto || type === 'first_message' || type === 'quiet') return;
    const fingerprint = JSON.stringify([message.swipe_id, message.mes, settings.language]);
    if (seen.get(id) === fingerprint) return;
    seen.set(id, fingerprint); if (seen.size > 100) seen.delete(seen.keys().next().value);
    try { generateMessage(message); } catch (e) { log('ERROR', e.message); }
});
for (const event of ['CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED']) {
    if (c.eventTypes[event]) c.eventSource.on(c.eventTypes[event], () => { stopAll(); seen.clear(); inline.schedule(); });
}
for (const event of ['MORE_MESSAGES_LOADED', 'CHAT_LOADED', 'APP_READY']) if (c.eventTypes[event]) c.eventSource.on(c.eventTypes[event], inline.schedule);
$('audio').addEventListener('pause', () => inline.schedule());
window.addEventListener('pagehide', () => { stopAll(); clearInterval(progressTimer); inline.disconnect(); apiKey = ''; });
log('INFO', 'Phiên bản 1.4.3 đã tải; vui lòng nhấp vào "Nâng cấp Worldbook" và "Thêm Regex" để bật giao thức Talk-Emo.');