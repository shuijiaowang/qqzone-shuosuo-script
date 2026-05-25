import { loadRecognizePayload } from '../core/recognize-storage.js';

const API_BASE = 'http://127.0.0.1:3840';
const REQUEST_TIMEOUT_MS = 30000;

export default defineBackground(() => {
    console.log('QQ空间说说抓取插件 background 已启动', { id: browser.runtime.id });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'CHECK_HEALTH') {
            checkHealth()
                .then((data) => sendResponse({ success: true, data }))
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }

        if (message.type === 'RECOGNIZE_IMAGE') {
            recognizeByStoredId(message.id)
                .then((data) => sendResponse({ success: true, data }))
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }
    });

    async function apiFetch(path, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                ...options,
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function checkHealth() {
        return apiFetch('/api/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /** 先由 content 写入 WXT storage，再通知；此处读取后请求本地 API */
    async function recognizeByStoredId(id) {
        const payload = await loadRecognizePayload(id);

        if (!payload?.imageBase64) {
            throw new Error('未找到待识别的图片数据');
        }

        return apiFetch('/api/qq-zone/recognize-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instruction: payload.instruction,
                imageBase64: payload.imageBase64,
            }),
        });
    }
    async function recognizeByStoredIdTest(id) {
        const payload = await loadRecognizePayload(id);

        if (!payload?.imageBase64) {
            throw new Error('未找到待识别的图片数据');
        }

        return apiFetch('/api/qq-zone/recognize-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instruction: payload.instruction,
                imageBase64: payload.imageBase64,
            }),
        });
    }
});
