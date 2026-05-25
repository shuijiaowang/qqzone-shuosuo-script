import { listRecognizePayloads, loadRecognizePayload } from '../core/recognize-storage.js';

const API_BASE = 'http://127.0.0.1:3840';
/** 与 DigitalMe 服务端 DASHSCOPE_TIMEOUT_MS 对齐，大图识别常超过 30s */
const REQUEST_TIMEOUT_MS = 120000;

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
            recognizeByStoredId(message.storageKey || message.id)
                .then((data) => sendResponse({ success: true, data }))
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }

        if (message.type === 'TEST_RECOGNIZE_ALL') {
            testRecognizeAll()
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
            let data = null;
            try {
                data = await response.json();
            } catch {
                data = null;
            }
            if (!response.ok) {
                const msg =
                    data?.error?.message ||
                    data?.message ||
                    `HTTP ${response.status}`;
                throw new Error(msg);
            }
            if (data && data.ok === false) {
                const msg = data?.error?.message || data?.error?.code || 'request failed';
                throw new Error(msg);
            }
            return data;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`请求超时（>${REQUEST_TIMEOUT_MS / 1000}s）`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    /** API 要求 imageBase64 为完整 data URL（含 data:image/...;base64, 前缀） */
    function prepareRecognizeBody(payload) {
        let imageBase64 = String(payload?.imageBase64 || '').trim();

        if (imageBase64 && !/^data:image\/[^;]+;base64,/i.test(imageBase64)) {
            const mime = String(payload?.imageMime || 'image/jpeg').trim() || 'image/jpeg';
            imageBase64 = `data:${mime};base64,${imageBase64.replace(/\s+/g, '')}`;
        }

        return {
            instruction: String(payload?.instruction || '').trim(),
            imageBase64,
        };
    }

    async function checkHealth() {
        return apiFetch('/api/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async function recognizePayload(payload) {
        const body = prepareRecognizeBody(payload);
        if (!body.instruction) {
            throw new Error('instruction 为空');
        }
        if (!body.imageBase64) {
            throw new Error('imageBase64 为空');
        }
        const result = await apiFetch('/api/qq-zone/recognize-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        console.log('[recognize-image] 接口返回:', result);
        return result;
    }

    /** 先由 content 写入 WXT storage，再通知；此处读取后请求本地 API */
    async function recognizeByStoredId(id) {
        const payload = await loadRecognizePayload(id);

        if (!payload?.imageBase64) {
            throw new Error('未找到待识别的图片数据');
        }

        return recognizePayload(payload);
    }

    /** 测试功能:获取所有存储的识别数据并请求后端 */
    async function testRecognizeAll() {
        try {
            const entries = await listRecognizePayloads();

            if (entries.length === 0) {
                const empty = { message: '没有找到存储的识别数据', count: 0 };
                console.log('[TEST_RECOGNIZE_ALL] 汇总:', empty);
                return empty;
            }

            const results = [];
            for (const { id, payload } of entries) {
                try {
                    const result = await recognizePayload(payload);
                    console.log(`[TEST_RECOGNIZE_ALL] ${id} 成功:`, result);
                    results.push({ id, success: true, data: result });
                } catch (error) {
                    console.warn(`[TEST_RECOGNIZE_ALL] ${id} 失败:`, error.message);
                    results.push({ id, success: false, error: error.message });
                }
            }

            const summary = {
                message: `已处理 ${results.length} 条识别数据`,
                count: results.length,
                results,
            };
            console.log('[TEST_RECOGNIZE_ALL] 汇总:', summary);
            return summary;
        } catch (error) {
            throw new Error(`测试识别失败: ${error.message}`);
        }
    }
});
