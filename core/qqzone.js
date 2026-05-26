// ============== QQ空间抓取 ==============
import { recognizeImage, resetRecognizeService, testRecognizeConnection } from './api.js';
import { buildImageRecognizeInstruction } from './config.js';
import {
    GRAB_MODE_NORMAL,
    GRAB_MODE_RECOGNIZE,
    getGrabMode,
    getRecognizeToken,
    isRecognizeTestPassed,
    setGrabMode,
    setRecognizeTestPassed,
    setRecognizeToken,
} from './grab-settings.js';
import { autoScrollToLoadImages, scrollBackToTop } from './scroop.js';

const DELAY_EXPAND = 1000;
const MAX_CANVAS_WIDTH = 1200;
const MAX_CANVAS_HEIGHT = 8000;
const DELAY_NEXT_PAGE = 5000;
const CHECK_INTERVAL = 1000;
const IFRAME_WAIT_TIMEOUT = 6000;

let allQQZoneData = [];
/** @type {typeof GRAB_MODE_NORMAL | typeof GRAB_MODE_RECOGNIZE} */
let currentGrabMode = GRAB_MODE_NORMAL;
let currentRecognizeToken = '';

/** 获取说说列表所在的 iframe document（懒加载 + 等待） */
async function getQQZoneDoc() {
    const deadline = Date.now() + IFRAME_WAIT_TIMEOUT;
    while (Date.now() < deadline) {
        const frame = document.querySelector('#app_canvas_frame')||document.querySelector("#app_container > iframe");
        const doc = frame?.contentDocument;
        if (doc?.querySelector('#msgList')) return doc;
        await sleep(CHECK_INTERVAL);
    }
    throw new Error('未找到 QQ 空间说说列表，请确认已打开说说页并等待页面加载完成');
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function updateStatus(text) {
    const el = document.getElementById('qq-grab-status');
    if (el) el.textContent = text;
}

function showResult(text) {
    const textarea = document.getElementById('qq-grab-result');
    if (textarea) textarea.value = text;
    const copyBtn = document.getElementById('qq-grab-copy');
    const copyJsonBtn = document.getElementById('qq-grab-copy-json');
    if (copyBtn) copyBtn.style.display = 'block';
    if (copyJsonBtn) copyJsonBtn.style.display = 'block';
}

async function copyText(text, doneMessage = '已复制到剪贴板！') {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const textarea = document.getElementById('qq-grab-result');
        if (textarea) {
            const prev = textarea.value;
            textarea.value = text;
            textarea.select();
            document.execCommand('copy');
            textarea.value = prev;
        }
    }
    updateStatus(doneMessage);
}

function setStartButtonEnabled(enabled, { busy = false } = {}) {
    const startBtn = document.getElementById('qq-grab-start');
    const triggerBtn = document.getElementById('qq-grab-trigger-btn');
    if (startBtn) {
        startBtn.disabled = !enabled;
        startBtn.textContent = busy ? '抓取中...' : '开始抓取';
    }
    if (triggerBtn) {
        triggerBtn.disabled = !enabled;
        triggerBtn.textContent = busy ? '⏳ 抓取中...' : '📥 抓取说说';
    }
}

/** 抓取结束后恢复按钮（抓取进行中勿调用） */
export async function syncGrabButtonState() {
    const startBtn = document.getElementById('qq-grab-start');
    const triggerBtn = document.getElementById('qq-grab-trigger-btn');
    const testBtn = document.getElementById('qq-grab-test');
    const grayClass = 'qq-grab-disabled-auth';

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '开始抓取';
        startBtn.classList.remove(grayClass);
    }
    if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = '📥 抓取说说';
        triggerBtn.classList.remove(grayClass);
    }
    if (testBtn) {
        testBtn.disabled = false;
        testBtn.classList.remove(grayClass);
    }
}

async function refreshGrabSettingsFromStorage() {
    currentGrabMode = await getGrabMode();
    currentRecognizeToken = await getRecognizeToken();
}

function applyModeUi(mode) {
    const tokenRow = document.getElementById('qq-grab-token-row');
    const testBtn = document.getElementById('qq-grab-test');
    const isRecognize = mode === GRAB_MODE_RECOGNIZE;

    if (tokenRow) tokenRow.style.display = isRecognize ? 'block' : 'none';
    if (testBtn) testBtn.style.display = isRecognize ? 'block' : 'none';

    const normalRadio = document.querySelector('input[name="qq-grab-mode"][value="normal"]');
    const recognizeRadio = document.querySelector('input[name="qq-grab-mode"][value="recognize"]');
    if (normalRadio) normalRadio.checked = mode === GRAB_MODE_NORMAL;
    if (recognizeRadio) recognizeRadio.checked = mode === GRAB_MODE_RECOGNIZE;
}

async function onGrabModeChange(mode) {
    currentGrabMode = mode;
    await setGrabMode(mode);
    applyModeUi(mode);
    if (mode === GRAB_MODE_RECOGNIZE) {
        updateStatus('识图模式：请填写 Token 并点击「测试识别连接」');
    } else {
        updateStatus('普通模式：图片将标记为 [图片]');
    }
    await syncGrabButtonState();
}

async function onTokenChange(token) {
    const next = String(token || '').trim();
    const prev = currentRecognizeToken || (await getRecognizeToken());
    if (next === prev) return;

    currentRecognizeToken = next;
    await setRecognizeToken(next);
    await syncGrabButtonState();
    if (currentGrabMode === GRAB_MODE_RECOGNIZE) {
        updateStatus('Token 已更新，请重新测试识别连接');
    }
}

async function runRecognizeTest() {
    const testBtn = document.getElementById('qq-grab-test');
    const tokenInput = document.getElementById('qq-grab-token');
    const token = String(tokenInput?.value || currentRecognizeToken || '').trim();

    if (!token) {
        updateStatus('请先填写 Token');
        await setRecognizeTestPassed(false);
        await syncGrabButtonState();
        return;
    }

    currentRecognizeToken = token;
    await setRecognizeToken(token);

    if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
    }
    updateStatus('正在测试识图连接...');

    const result = await testRecognizeConnection(token);

    if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = '测试识别连接';
    }

    if (result.ok) {
        await setRecognizeTestPassed(true);
        const preview = result.data?.content
            ? String(result.data.content).slice(0, 40)
            : '';
        updateStatus(
            preview
                ? `识图测试通过：${preview}${preview.length >= 40 ? '…' : ''}`
                : '识图测试通过，可以开始抓取',
        );
    } else {
        await setRecognizeTestPassed(false);
        updateStatus(`识图测试失败：${result.error}`);
    }

    await syncGrabButtonState();
}

function ensurePanel() {
    if (document.getElementById('qq-grab-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'qq-grab-panel';
    panel.innerHTML = `
      <div id="qq-grab-header">QQ空间说说抓取</div>
      <div id="qq-grab-status">就绪</div>
      <div id="qq-grab-mode-row">
        <label class="qq-grab-mode-label">
          <input type="radio" name="qq-grab-mode" value="normal" checked> 普通模式
        </label>
        <label class="qq-grab-mode-label">
          <input type="radio" name="qq-grab-mode" value="recognize"> 识图模式
        </label>
      </div>
      <div id="qq-grab-token-row" style="display:none;">
        <label id="qq-grab-token-label" for="qq-grab-token">Token</label>
        <input type="password" id="qq-grab-token" placeholder="登录后获得的 Bearer Token" autocomplete="off">
      </div>
      <button id="qq-grab-test" type="button" style="display:none;">测试识别连接</button>
      <button id="qq-grab-start">开始抓取</button>
      <div id="qq-grab-actions">
        <button id="qq-grab-copy" style="display:none;">复制文本</button>
        <button id="qq-grab-copy-json" style="display:none;">复制 JSON</button>
      </div>
      <textarea id="qq-grab-result" readonly placeholder="抓取结果将显示在此处..."></textarea>
      <style>
        #qq-grab-panel {
          position: fixed; top: 70px; right: 20px; z-index: 999998;
          width: 400px; background: #fff; border: 2px solid #3b82f6;
          border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.25);
          font-family: -apple-system, "Microsoft YaHei", sans-serif;
          display: flex; flex-direction: column; overflow: hidden;
        }
        #qq-grab-header {
          background: #3b82f6; color: #fff; padding: 10px 14px;
          font-size: 15px; font-weight: 600;
        }
        #qq-grab-status {
          padding: 8px 14px; font-size: 13px; color: #555;
          border-bottom: 1px solid #eee;
        }
        #qq-grab-mode-row {
          display: flex; gap: 16px; padding: 10px 14px 0;
          font-size: 13px; color: #333;
        }
        .qq-grab-mode-label { cursor: pointer; user-select: none; }
        .qq-grab-mode-label input { margin-right: 4px; }
        #qq-grab-token-row {
          padding: 8px 14px 0; display: flex; flex-direction: column; gap: 6px;
        }
        #qq-grab-token-label { font-size: 12px; color: #666; }
        #qq-grab-token {
          width: 100%; box-sizing: border-box; padding: 6px 8px;
          border: 1px solid #ddd; border-radius: 6px; font-size: 12px;
        }
        #qq-grab-test {
          margin: 8px 14px 0; padding: 8px 0; border: none; border-radius: 6px;
          font-size: 14px; cursor: pointer; color: #fff; background: #10b981;
        }
        #qq-grab-test:hover { background: #059669; }
        #qq-grab-test:disabled { background: #9ca3af; cursor: not-allowed; }
        .qq-grab-disabled-auth,
        #qq-grab-start.qq-grab-disabled-auth:disabled,
        #qq-grab-trigger-btn.qq-grab-disabled-auth:disabled {
          background: #9ca3af !important; cursor: not-allowed !important;
        }
        #qq-grab-actions {
          display: flex; gap: 8px; margin: 8px 14px 0; padding: 0;
        }
        #qq-grab-start, #qq-grab-copy, #qq-grab-copy-json {
          margin: 8px 14px; padding: 8px 0; border: none; border-radius: 6px;
          font-size: 14px; cursor: pointer; color: #fff; background: #3b82f6;
          transition: background .2s;
        }
        #qq-grab-actions #qq-grab-copy,
        #qq-grab-actions #qq-grab-copy-json {
          flex: 1; margin: 0;
        }
        #qq-grab-copy-json { background: #0d9488; }
        #qq-grab-start:hover, #qq-grab-copy:hover { background: #2563eb; }
        #qq-grab-copy-json:hover { background: #0f766e; }
        #qq-grab-start:disabled { background: #93c5fd; cursor: not-allowed; }
        #qq-grab-result {
          margin: 0 14px 14px; height: 300px; resize: vertical;
          border: 1px solid #ddd; border-radius: 6px; padding: 8px;
          font-size: 12px; font-family: Consolas, monospace;
          box-sizing: border-box; width: calc(100% - 28px);
        }
      </style>
    `;
    document.body.appendChild(panel);

    document.querySelectorAll('input[name="qq-grab-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            if (radio.checked) onGrabModeChange(radio.value);
        });
    });

    const tokenInput = document.getElementById('qq-grab-token');
    tokenInput?.addEventListener('change', () => onTokenChange(tokenInput.value));

    document.getElementById('qq-grab-test')?.addEventListener('click', () => runRecognizeTest());

    document.getElementById('qq-grab-start').addEventListener('click', () => startGrab());
    document.getElementById('qq-grab-copy').addEventListener('click', async () => {
        const textarea = document.getElementById('qq-grab-result');
        await copyText(textarea.value, '已复制文本到剪贴板！');
    });
    document.getElementById('qq-grab-copy-json').addEventListener('click', async () => {
        await copyText(buildFinalJson(), '已复制 JSON 到剪贴板！');
    });

    void initPanelSettings();
}

async function initPanelSettings() {
    await refreshGrabSettingsFromStorage();
    const tokenInput = document.getElementById('qq-grab-token');
    if (tokenInput) tokenInput.value = currentRecognizeToken;
    applyModeUi(currentGrabMode);
    if (currentGrabMode === GRAB_MODE_RECOGNIZE) {
        const passed = await isRecognizeTestPassed();
        updateStatus(
            passed
                ? '识图模式：测试已通过，可以开始抓取'
                : '识图模式：请填写 Token 并点击「测试识别连接」',
        );
    } else {
        updateStatus('普通模式：图片将标记为 [图片]');
    }
    await syncGrabButtonState();
}

function buildFinalText() {
    let text = '';
    allQQZoneData.forEach((item, index) => {
        if (item.zf_name !== '') {
            text += `【${index + 1}】${item.time}：${item.content} , 转发自：${item.zf_name}:${item.zf_content}\n`;
        } else {
            text += `【${index + 1}】${item.time}：${item.content}\n`;
        }
    });
    return text;
}

function buildFinalJson() {
    const items = allQQZoneData.map((item, index) => {
        const entry = {
            index: index + 1,
            time: item.time,
            content: item.content,
        };
        if (item.zf_name) {
            entry.repost = { author: item.zf_name, content: item.zf_content };
        }
        return entry;
    });
    return JSON.stringify({ count: items.length, items }, null, 2);
}

async function expandAllContent(qqDoc) {
    const toggleLinks = qqDoc.querySelectorAll('.f_toggle a');
    console.log(`📌 当前页需展开的条目数：${toggleLinks.length}`);

    for (const link of toggleLinks) {
        if (link.textContent.trim() === '展开查看全文') {
            link.click();
            await sleep(DELAY_EXPAND);
        }
    }
    console.log('📄 当前页所有内容展开完成！');
}

function getPureText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('a, img, style, script, iframe').forEach((tag) => tag.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
}

function loadImage(imgEl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imgEl.src + '?t=' + Date.now();
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
}

function scaleToFit(width, height, maxW, maxH) {
    const ratio = Math.min(maxW / width, maxH / height, 1);
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
    };
}

async function mergeImagesVertical(images) {
    const loadedImgs = await Promise.all(images.map((img) => loadImage(img)));

    let totalHeight = 0;
    const maxWidth = Math.max(...loadedImgs.map((img) => img.naturalWidth));
    loadedImgs.forEach((img) => {
        totalHeight += img.naturalHeight;
    });

    const fitted = scaleToFit(maxWidth, totalHeight, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT);
    const scale = fitted.width / maxWidth;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = fitted.width;
    canvas.height = fitted.height;

    let currentY = 0;
    loadedImgs.forEach((img) => {
        const h = Math.round(img.naturalHeight * scale);
        ctx.drawImage(img, 0, currentY, fitted.width, h);
        currentY += h;
    });

    return canvas.toDataURL('image/jpeg', 0.75);
}

async function imagesToBase64(imgList) {
    if (!imgList.length) return '';
    console.log(`✅ 找到 ${imgList.length} 张图片，开始拼接`);
    try {
        return await mergeImagesVertical(Array.from(imgList));
    } catch (err) {
        console.error('❌ 图片拼接失败：', err);
        return '';
    }
}

async function getPicContent(imgList, textContext = '') {
    if (!imgList.length) return '';

    if (currentGrabMode === GRAB_MODE_NORMAL) {
        return '[图片]';
    }

    console.log('[qqzone] getPicContent', { imgCount: imgList.length, hasContext: !!String(textContext || '').trim() });
    const base64 = await imagesToBase64(imgList);
    console.log('[qqzone] imagesToBase64 完成', {
        imgCount: imgList.length,
        base64Len: base64?.length ?? 0,
        hasDataUrl: !!base64?.startsWith?.('data:image/'),
    });
    if (!base64) return '[图片]';

    const data = await recognizeImage(
        {
            instruction: buildImageRecognizeInstruction(textContext),
            imageBase64: base64,
        },
        currentRecognizeToken,
    );
    console.log('[qqzone] recognizeImage 结束', {
        ok: !!data?.ok,
        hasContent: !!data?.content,
        contentPreview: data?.content ? String(data.content).slice(0, 80) : null,
    });
    if (data?.content) return `[图片:${data.content}]`;
    return '[图片]';
}

async function extractCurrentPageData(qqDoc) {
    const msgList = qqDoc.querySelectorAll('#msgList > li');
    console.log(`📌 当前页找到说说：${msgList.length} 条`);

    for (const item of msgList) {
        const timeEl = item.querySelector('.ft .info span a');
        let time = '';
        if (timeEl) {
            time = (timeEl.getAttribute('title') || '').replace(/^编辑于\s*/, '').trim();
        }

        const contentEl = item.querySelector('.bd pre.content');
        const contentText = getPureText(contentEl);
        const contentPic = await getPicContent(
            item.querySelectorAll('.box > .md > .pic img'),
            contentText,
        );
        const contentVideo = item.querySelector('.box > .md > .video') ? '[视频]' : '';
        const content = contentText + contentPic + contentVideo;

        const zf_name = item.querySelector('.md .bd a')?.textContent || '';
        const zfText = getPureText(item.querySelector('.md .bd pre'));
        const zf_Pic = await getPicContent(item.querySelectorAll('.md .md .pic img'), zfText);
        const zf_content = zfText + zf_Pic;

        if (time || content) {
            allQQZoneData.push({ time, content, zf_name, zf_content });
        }
    }
}

async function autoGrabAndNextPage(qqDoc) {
    if (currentGrabMode === GRAB_MODE_RECOGNIZE) {
        updateStatus('滚动加载图片...');
        await autoScrollToLoadImages();
    }

    await expandAllContent(qqDoc);
    updateStatus('解析当前页说说...');
    await extractCurrentPageData(qqDoc);

    const nextPageBtn = qqDoc.querySelector('.mod_pagenav_main a[title="下一页"]');
    if (!nextPageBtn) {
        const finalText = buildFinalText();
        console.log('🎉 抓取完成：\n', finalText);
        showResult(finalText);
        updateStatus(`抓取完成！总计 ${allQQZoneData.length} 条说说`);
        await syncGrabButtonState();
        return;
    }

    console.log(`⏳ ${DELAY_NEXT_PAGE / 1000} 秒后跳转下一页...`);
    updateStatus(`已抓取 ${allQQZoneData.length} 条，准备翻页...`);
    nextPageBtn.click();

    await sleep(DELAY_NEXT_PAGE);

    const deadline = Date.now() + IFRAME_WAIT_TIMEOUT;
    while (Date.now() < deadline) {
        const list = qqDoc.querySelectorAll('#msgList > li');
        if (list.length) {
            if (currentGrabMode === GRAB_MODE_RECOGNIZE) {
                scrollBackToTop();
                await sleep(CHECK_INTERVAL);
            }
            await autoGrabAndNextPage(qqDoc);
            return;
        }
        await sleep(CHECK_INTERVAL);
    }
    throw new Error('翻页后页面加载超时');
}

async function startGrab() {
    await refreshGrabSettingsFromStorage();

    if (currentGrabMode === GRAB_MODE_RECOGNIZE && !(await isRecognizeTestPassed())) {
        alert('识图模式需先点击「测试识别连接」并通过后才能抓取');
        return;
    }

    setStartButtonEnabled(false, { busy: true });
    allQQZoneData = [];
    resetRecognizeService();

    try {
        updateStatus('正在连接说说页面...');
        const qqDoc = await getQQZoneDoc();

        while (!qqDoc.querySelectorAll('#msgList > li').length) {
            updateStatus('正在加载说说列表...');
            await sleep(CHECK_INTERVAL);
        }

        updateStatus('开始抓取...');
        await autoGrabAndNextPage(qqDoc);
    } catch (error) {
        console.error('❌ 抓取出错：', error);
        updateStatus(`出错：${error.message}`);
    } finally {
        await syncGrabButtonState();
    }
}

/** 外层「抓取说说」：识图模式下打开面板并将测试通过标记置为 false */
export async function openGrabPanelFromTrigger() {
    await refreshGrabSettingsFromStorage();
    if (currentGrabMode === GRAB_MODE_RECOGNIZE) {
        await setRecognizeTestPassed(false);
    }
    await QQZoneGrabber({ autoStart: false });
}

/** @param {{ autoStart?: boolean }} [options] */
export async function QQZoneGrabber(options = {}) {
    const { autoStart = false } = options;
    console.log('🚀 QQ空间抓取器启动');
    ensurePanel();
    await refreshGrabSettingsFromStorage();
    await syncGrabButtonState();
    if (autoStart) {
        await startGrab();
    }
}
