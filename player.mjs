export class SpeechQueue {
    constructor({ audio, synthesize, log, changed, createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL }) {
        Object.assign(this, { audio, synthesize, log, changed, createURL, revokeURL });
        this.items = []; this.epoch = 0; this.paused = false; this.running = false; this.url = null;
        this.phase = 'idle';
    }
    enqueue(items) { this.error = null; this.items.push(...items); this.changed(this); void this.run(); }
    stop() {
        this.epoch++; this.items = []; this.running = false; this.current = null; this.error = null;
        this.controller?.abort(); this.finish?.(); this.audio.pause();
        this.audio.removeAttribute('src'); this.audio.load();
        if (this.url) this.revokeURL(this.url);
        this.url = null; this.paused = false; this.phase = 'idle'; this.changed(this);
    }
    skip() { this.controller?.abort(); this.audio.pause(); this.finish?.(); }
    pause() { this.paused = true; this.audio.pause(); this.changed(this); }
    async resume() {
        this.paused = false;
        if (this.audio.getAttribute('src')) {
            try { await this.audio.play(); }
            catch { this.paused = true; this.log('WARN', 'Trình duyệt chặn phát, vui lòng nhấp vào nút phát của điều khiển âm thanh'); }
        }
        this.changed(this);
    }
    async run() {
        if (this.running) return;
        this.running = true;
        const epoch = this.epoch;
        while (this.items.length && epoch === this.epoch) {
            const item = this.items.shift(); this.current = item; this.phase = 'generating';
            const controller = new AbortController(); this.controller = controller;
            this.changed(this);
            try {
                const blob = await this.synthesize(item, controller.signal);
                if (controller.signal.aborted || epoch !== this.epoch) continue;
                if (this.url) this.revokeURL(this.url);
                this.url = this.createURL(blob); this.audio.src = this.url; this.phase = 'playing'; this.changed(this);
                await new Promise(resolve => {
                    const done = () => {
                        this.audio.removeEventListener('ended', done);
                        this.audio.removeEventListener('error', failed);
                        if (this.finish === done) this.finish = null;
                        resolve();
                    };
                    const failed = () => { this.log('ERROR', 'Giải mã âm thanh thất bại, đã bỏ qua câu này'); done(); };
                    this.finish = done;
                    this.audio.addEventListener('ended', done);
                    this.audio.addEventListener('error', failed);
                    if (!this.paused) void this.resume();
                });
            } catch (e) {
                if (!controller.signal.aborted) {
                    this.error = e.message;
                    this.log('ERROR', e.message);
                    // Failed API requests need explicit user retry; never burn through a queue on 401/402.
                    this.items = [];
                }
            }
        }
        if (epoch === this.epoch) { this.running = false; this.phase = 'idle'; this.changed(this); }
    }
}