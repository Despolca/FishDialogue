import https from 'node:https';
import { storeFor, audioId, openAudioFolder } from './audio-store.mjs';
import { ProgressRegistry } from './progress.mjs';
const progress = new ProgressRegistry();

export const info = { id: 'fish-dialogue', name: 'Fish Dialogue Bridge', description: 'Fish TTS through SillyTavern requestProxy' };
export const KNOWN_ENGINES = ['s2.1-pro-free', 's2.1-pro', 's2-pro', 's1', 'drama-3-preview'];
let engineCatalog = [...KNOWN_ENGINES];

export function validateBase(value, extraHosts = process.env.FISH_ALLOWED_HOSTS || '') {
    const u = new URL(value || 'https://api.fish.audio');
    const hosts = new Set(['api.fish.audio', ...extraHosts.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)]);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !hosts.has(u.hostname.toLowerCase())) {
        throw new Error('Base URL phải là HTTPS, và máy chủ nằm trong FISH_ALLOWED_HOSTS (api.fish.audio đã được cho phép)');
    }
    u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') + '/';
    return u;
}

export function proxyStatus() {
    return { agent: https.globalAgent?.constructor?.name || 'unknown', configured: /ProxyAgent/i.test(https.globalAgent?.constructor?.name || '') };
}

// node:https intentionally uses the CURRENT globalAgent installed by SillyTavern.
// Native fetch/Undici would bypass it. Never silently fall back to a direct request.
export function requestBytes(url, { method = 'GET', headers = {}, body, signal, maxBytes = 25 * 1024 * 1024, onProgress = () => {} } = {}) {
    if (!proxyStatus().configured) return Promise.reject(new Error('requestProxy của tửu quán chưa có hiệu lực: không tìm thấy ProxyAgent toàn cục, vui lòng bật proxy và khởi động lại tửu quán'));
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method, headers, signal, agent: https.globalAgent }, res => {
            const parts = []; let size = 0;
            const length = Number(res.headers['content-length']);
            const totalBytes = Number.isFinite(length) && length > 0 ? length : null;
            onProgress({status:'receiving',receivedBytes:0,totalBytes});
            res.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) { res.destroy(new Error('Phản hồi từ upstream vượt quá giới hạn kích thước')); return; }
                parts.push(chunk);
                onProgress({status:'receiving',receivedBytes:size,totalBytes});
            });
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), bytes: Buffer.concat(parts) }));
        });
        const timer = setTimeout(() => req.destroy(new Error('Yêu cầu Fish hết thời gian chờ (120 giây)')), 120000);
        req.on('close', () => clearTimeout(timer));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

export function ttsBody(input, base) {
    const text = input.text;
    if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 2000) throw new Error('Cuộc hội thoại không được để trống hoặc vượt quá 2000 ký tự');
    const model = String(input.model || 's2.1-pro-free');
    if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(model)) throw new Error('Định dạng tên mô hình không hợp lệ');
    if (base.hostname === 'api.fish.audio' && !engineCatalog.includes(model)) throw new Error('Endpoint chính thức không chấp nhận engine không xác định để tránh tự động lùi về mô hình trả phí; vui lòng tra cứu engine trước');
    if (typeof input.voice !== 'string' || !input.voice.trim() || input.voice.length > 200) throw new Error('Vui lòng liên kết ID giọng nói trước');
    return { model, payload: { text, reference_id: input.voice.trim(), format: 'mp3', latency: 'normal' } };
}

export async function init(router) {
    router.get('/health', (_req, res) => res.json({ version: '1.4.3', ...proxyStatus() }));
    const localRoute = (name, handler) => router.post(name, async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); await handler(req, res, storeFor(req)); }
        catch (e) { if (!res.headersSent) res.status(400).json({ error: String(e.message).slice(0, 400) }); }
    });
    localRoute('/library', async (_req, res, store) => res.json(await store.list()));
    localRoute('/progress', async (req,res,store) => res.json({job:progress.read(store.directory,req.body?.jobId)}));
    localRoute('/library/limit', async (req, res, store) => res.json(await store.setLimit(req.body?.maxFiles)));
    localRoute('/library/open', async (req, res, store) => {
        const library = await store.list(); await openAudioFolder(req, library.path); res.json({ path: library.path, opened: true });
    });
    localRoute('/audio', async (req, res, store) => {
        const bytes = await store.read(req.body?.id);
        if (!bytes) return res.status(404).json({ error: 'Âm thanh đã được dọn dẹp; nhấp vào nút phát của đoạn hội thoại tương ứng để tạo lại' });
        return res.type('audio/mpeg').send(bytes);
    });
    for (const action of ['tts', 'voices', 'engines']) router.post('/' + action, async (req, res) => {
        const controller = new AbortController();
        let report = () => {};
        const onClose = () => { if (!res.writableEnded) { controller.abort(); report({status:'canceled'}); } };
        res.on('close', onClose);
        try {
            const input = req.body || {};
            if(action === 'tts' && input.jobId) report = progress.start(storeFor(req).directory,input.jobId);
            const base = validateBase(input.baseUrl);
            let persistentId, store;
            if (action === 'tts' && input.persist === true) {
                const validated = ttsBody(input, base);
                input.baseUrl = base.href; input.model = validated.model; input.voice = validated.payload.reference_id;
                persistentId = audioId(input); store = storeFor(req);
                const cached = await store.read(persistentId);
                if (cached) {
                    report({status:'ready',receivedBytes:cached.length,totalBytes:cached.length,cacheSource:'disk'});
                    res.set('Cache-Control', 'no-store'); res.set('X-Fish-Audio-Id', persistentId);
                    res.set('X-Fish-Cache', 'disk'); return res.type('audio/mpeg').send(cached);
                }
            }
            let url, headers = {}, body, method = 'GET';
            if (action === 'engines' && base.hostname === 'api.fish.audio') {
                url = new URL('https://docs.fish.audio/api-reference/openapi.json');
            } else {
                if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || /[\r\n]/.test(input.apiKey)) throw new Error('Vui lòng điền API Key hợp lệ');
                headers.Authorization = `Bearer ${input.apiKey.trim()}`;
                if (action === 'tts') {
                    const validated = ttsBody(input, base);
                    url = new URL('v1/tts', base); method = 'POST';
                    headers.model = validated.model;
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(validated.payload);
                } else if (action === 'voices') {
                    url = new URL('model', base);
                    url.searchParams.set('page_size', '20');
                    url.searchParams.set('page_number', String(Math.max(1, Math.min(1000, Number(input.page) || 1))));
                    if (input.title) url.searchParams.set('title', String(input.title).slice(0, 100));
                    if (input.self) url.searchParams.set('self', 'true');
                } else url = new URL('v1/models', base);
            }
            const result = await requestBytes(url, { method, headers, body, signal: controller.signal, onProgress:report, maxBytes: action === 'tts' ? 25 * 1024 * 1024 : 5 * 1024 * 1024 });
            if (result.status < 200 || result.status >= 300) {
                report({status:'failed',httpStatus:result.status});
                // Do not echo arbitrary upstream bodies: they may contain the key or dialogue.
                const hints = { 401: 'API Key không hợp lệ', 402: 'Giới hạn hạn mức hoặc thanh toán', 403: 'Không đủ quyền hạn', 404: 'Giao diện hoặc giọng nói không tồn tại', 429: 'Yêu cầu quá thường xuyên', 503: 'Dịch vụ tạm thời không khả dụng' };
                return res.status(result.status >= 400 && result.status < 600 ? result.status : 502).json({ error: `Fish HTTP ${result.status}: ${hints[result.status] || 'vui lòng kiểm tra giao diện nhà cung cấp dịch vụ'}; không tự động thử lại` });
            }
            res.set('Cache-Control', 'no-store');
            if (action === 'tts') {
                if (!result.bytes.length || !/^(audio\/|application\/octet-stream)/i.test(result.type)) throw new Error('Upstream không trả về âm thanh, vui lòng kiểm tra Base URL và mô hình');
                if (store && persistentId && !controller.signal.aborted) {
                    report({status:'saving'});
                    await store.save(persistentId, result.bytes, input);
                    res.set('X-Fish-Audio-Id', persistentId); res.set('X-Fish-Cache', 'generated');
                }
                report({status:controller.signal.aborted?'canceled':'ready',receivedBytes:result.bytes.length});
                return res.type('audio/mpeg').send(result.bytes);
            }
            const data = JSON.parse(result.bytes.toString('utf8'));
            if (action === 'voices') return res.json({ total: data.total, items: (data.items || []).map(x => ({ id: x._id, title: x.title, languages: x.languages })) });
            if (base.hostname === 'api.fish.audio') {
                const spec = data.paths?.['/v1/tts']?.post;
                const params = [...(data.paths?.['/v1/tts']?.parameters || []), ...(spec?.parameters || [])];
                const models = params.find(x => x.in === 'header' && x.name.toLowerCase() === 'model')?.schema?.enum;
                if (!Array.isArray(models) || !models.length) throw new Error('Cấu trúc tài liệu chính thức đã thay đổi; vui lòng tiếp tục sử dụng engine được thiết lập sẵn và xem tài liệu');
                engineCatalog = models.filter(x => typeof x === 'string');
                return res.json({ models: engineCatalog, source: 'Tài liệu OpenAPI chính thức của Fish (không đại diện cho hạn mức khả dụng của tài khoản)' });
            }
            const models = (data.data || data.models || []).map(x => typeof x === 'string' ? x : x.id).filter(Boolean);
            if (!models.length) throw new Error('Dịch vụ này không trả về danh sách /v1/models có thể nhận dạng, vui lòng điền engine thủ công');
            return res.json({ models, source: 'Dịch vụ tùy chỉnh /v1/models' });
        } catch (e) {
            report({status:controller.signal.aborted?'canceled':'failed'});
            if (!res.destroyed && !res.headersSent) {
                const safe = String(e.message).replaceAll(String(req.body?.apiKey || '__NO_KEY__'), '[REDACTED]');
                res.status(502).json({ error: safe.slice(0, 400) });
            }
        } finally { res.off('close', onClose); }
    });
}