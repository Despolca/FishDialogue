import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['package.json', 'fish-dialogue.mjs', 'audio-store.mjs', 'progress.mjs'];
function isRoot(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name.toLowerCase() === 'sillytavern'
            && fs.existsSync(path.join(dir,'src/plugin-loader.js'));
    } catch { return false; }
}
export function findRoot(start) {
    let dir = path.resolve(start);
    while (!isRoot(dir)) {
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('Không thể tự động định vị tửu quán. Vui lòng đặt trình cài đặt trong thư mục tiện ích mở rộng của tửu quán, hoặc chạy lệnh node install-server.mjs "Thư mục gốc tửu quán".');
        dir = parent;
    }
    return fs.realpathSync(dir);
}
function noLinks(root, target) {
    const rel = path.relative(root,target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Đường dẫn đích vượt ra ngoài thư mục tửu quán');
    let current = root;
    for (const part of rel.split(path.sep).filter(Boolean)) {
        current = path.join(current,part);
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Đường dẫn cài đặt chứa symbolic link hoặc directory junction, vui lòng cài đặt thủ công');
    }
}
export function installServer(source = path.join(here,'server'), rootInput = findRoot(here)) {
    const root = fs.realpathSync(rootInput);
    if (!isRoot(root)) throw new Error('Đường dẫn được chỉ định không phải là thư mục gốc của SillyTavern');
    // Read and validate the whole source before making any changes.
    const content = new Map(files.map(name=>[name,fs.readFileSync(path.join(source,name))]));
    const pkg = JSON.parse(content.get('package.json').toString());
    if (pkg.name !== 'fish-dialogue-server' || pkg.main !== 'fish-dialogue.mjs') throw new Error('Tệp máy chủ không khớp');
    const target = path.join(root,'plugins/fish-dialogue');
    const legacy = path.join(root,'plugins/fish-dialogue.mjs');
    noLinks(root,target); noLinks(root,legacy);
    for (const name of files) noLinks(root,path.join(target,name));
    if (fs.existsSync(target)) {
        if (!fs.statSync(target).isDirectory()) throw new Error('plugins/fish-dialogue đã tồn tại và không phải là thư mục');
        const current = path.join(target,'package.json');
        if (!fs.existsSync(current) || JSON.parse(fs.readFileSync(current,'utf8')).name !== pkg.name) throw new Error('Thư mục đích không phải là máy chủ Fish đã biết, từ chối ghi đè');
    }
    const backup = path.join(root,'fish-dialogue-install-backups',Date.now()+'-'+randomUUID());
    noLinks(root,backup);
    const saved = [];
    if (fs.existsSync(target)) for (const name of files) {
        const p = path.join(target,name);
        if (fs.existsSync(p)) saved.push([name,fs.readFileSync(p)]);
    }
    if (fs.existsSync(legacy)) saved.push(['legacy-fish-dialogue.mjs',fs.readFileSync(legacy)]);
    if (saved.length) {
        fs.mkdirSync(backup,{recursive:true});
        for(const [name,bytes] of saved) fs.writeFileSync(path.join(backup,name),bytes,{flag:'wx'});
    }
    fs.mkdirSync(target,{recursive:true});
    try {
        for(const [name,bytes] of content) fs.writeFileSync(path.join(target,name),bytes);
        // Disable the old single-file loader only after its backup and the new install succeeded.
        if (fs.existsSync(legacy)) fs.renameSync(legacy,path.join(backup,'disabled-legacy.mjs'));
    } catch (error) {
        throw new Error(`Cài đặt chưa hoàn tất: ${error.message}. Bản sao lưu tệp cũ: ${saved.length ? backup : 'Không có tệp cũ'}; vui lòng sửa lỗi và chạy lại trình cài đặt.`);
    }
    return { target, backup:saved.length ? backup : null, version:pkg.version };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = installServer(path.join(here,'server'),process.argv[2] ? path.resolve(process.argv[2]) : findRoot(here));
        console.log(`Máy chủ Fish ${result.version} đã được cài đặt: ${result.target}`);
        if(result.backup) console.log(`Bản sao lưu tệp cũ: ${result.backup}`);
        console.log('Vui lòng xác nhận enableServerPlugins: true trong config.yaml, sau đó khởi động lại hoàn toàn tửu quán, rồi nhấp vào "Kiểm tra proxy tửu quán".\nTrình cài đặt không thay đổi cấu hình, dữ liệu tài khoản, âm thanh hoặc Worldbook.');
    } catch(error) { console.error('Cài đặt thất bại: '+error.message); process.exitCode=1; }
}