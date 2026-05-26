// ============== QQ空间抓取 ==============
import { isRecognizeServiceAvailable, recognizeImage, resetRecognizeService } from './api.js';
import { IMAGE_RECOGNIZE_INSTRUCTION } from './config.js';
import { autoScrollToLoadImages, scrollBackToTop } from './scroop.js';

const DELAY_EXPAND = 1000;
const MAX_CANVAS_WIDTH = 1200;
const MAX_CANVAS_HEIGHT = 8000;
const DELAY_NEXT_PAGE = 5000;
const CHECK_INTERVAL = 1000;
const IFRAME_WAIT_TIMEOUT = 6000;

let allQQZoneData = [];

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

function setStartButtonEnabled(enabled) {
    const startBtn = document.getElementById('qq-grab-start');
    const triggerBtn = document.getElementById('qq-grab-trigger-btn');
    if (startBtn) {
        startBtn.disabled = !enabled;
        startBtn.textContent = enabled ? '开始抓取' : '抓取中...';
    }
    if (triggerBtn) {
        triggerBtn.disabled = !enabled;
        triggerBtn.textContent = enabled ? '📥 抓取说说' : '⏳ 抓取中...';
    }
}

function ensurePanel() {
    if (document.getElementById('qq-grab-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'qq-grab-panel';
    panel.innerHTML = `
      <div id="qq-grab-header">QQ空间说说抓取</div>
      <div id="qq-grab-status">就绪</div>
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

    document.getElementById('qq-grab-start').addEventListener('click', () => startGrab());
    document.getElementById('qq-grab-copy').addEventListener('click', async () => {
        const textarea = document.getElementById('qq-grab-result');
        await copyText(textarea.value, '已复制文本到剪贴板！');
    });
    document.getElementById('qq-grab-copy-json').addEventListener('click', async () => {
        await copyText(buildFinalJson(), '已复制 JSON 到剪贴板！');
    });
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

async function getPicContent(imgList) {
    console.log('[qqzone] getPicContent', { imgCount: imgList.length });
    const base64 = await imagesToBase64(imgList);
    console.log('[qqzone] imagesToBase64 完成', {
        imgCount: imgList.length,
        base64Len: base64?.length ?? 0,
        hasDataUrl: !!base64?.startsWith?.('data:image/'),
    });
    if (!base64) return '[图片]';

    const data = await recognizeImage({
        instruction: IMAGE_RECOGNIZE_INSTRUCTION,
        imageBase64: base64,
    });
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

        const contentPic = await getPicContent(item.querySelectorAll('.box > .md > .pic img'));
        const contentVideo = item.querySelector('.box > .md > .video') ? '[视频]' : '';
        const contentEl = item.querySelector('.bd pre.content');
        const content = getPureText(contentEl) + contentPic + contentVideo;

        const zf_name = item.querySelector('.md .bd a')?.textContent || '';
        const zf_Pic = item.querySelector('.md .md .pic') ? '[图片]' : '';
        const zf_content = getPureText(item.querySelector('.md .bd pre')) + zf_Pic;

        if (time || content) {
            allQQZoneData.push({ time, content, zf_name, zf_content });
        }
    }
}

async function autoGrabAndNextPage(qqDoc) {
    updateStatus('滚动加载图片...');
    await autoScrollToLoadImages();

    await expandAllContent(qqDoc);
    updateStatus('解析当前页说说...');
    await extractCurrentPageData(qqDoc);

    const nextPageBtn = qqDoc.querySelector('.mod_pagenav_main a[title="下一页"]');
    if (!nextPageBtn) {
        const finalText = buildFinalText();
        console.log('🎉 抓取完成：\n', finalText);
        showResult(finalText);
        updateStatus(`抓取完成！总计 ${allQQZoneData.length} 条说说`);
        setStartButtonEnabled(true);
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
            scrollBackToTop();
            await sleep(CHECK_INTERVAL);
            await autoGrabAndNextPage(qqDoc);
            return;
        }
        await sleep(CHECK_INTERVAL);
    }
    throw new Error('翻页后页面加载超时');
}

async function startGrab() {
    setStartButtonEnabled(false);
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
        setStartButtonEnabled(true);
    }
}

/** @param {{ autoStart?: boolean }} [options] */
export async function QQZoneGrabber(options = {}) {
    const { autoStart = true } = options;
    console.log('🚀 QQ空间抓取器启动');
    ensurePanel();
    if (autoStart) {
        await startGrab();
    }
}
