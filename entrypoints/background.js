import { listRecognizePayloads, loadRecognizePayload } from '../core/recognize-storage.js';

const API_BASE = 'http://127.0.0.1:3840';
/** 与 DigitalMe 服务端 DASHSCOPE_TIMEOUT_MS 对齐，大图识别常超过 30s */
const REQUEST_TIMEOUT_MS = 120000;
const LOG = '[qqzone-bg]';

export default defineBackground(() => {
    console.log('QQ空间说说抓取插件 background 已启动', { id: browser.runtime.id });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const type = message?.type;
        if (!type) return;

        console.log(LOG, 'onMessage', {
            type,
            tabId: sender?.tab?.id,
            storageKey: message.storageKey || message.id,
        });

        const reply = (promise) => {
            const t0 = Date.now();
            promise
                .then((data) => {
                    console.log(LOG, `${type} 完成`, {
                        ms: Date.now() - t0,
                        success: true,
                        dataOk: data?.ok,
                        dataKeys: data ? Object.keys(data) : [],
                    });
                    sendResponse({ success: true, data });
                })
                .catch((error) => {
                    console.error(LOG, `${type} 失败`, {
                        ms: Date.now() - t0,
                        name: error?.name,
                        message: error?.message,
                    });
                    sendResponse({ success: false, error: error.message });
                });
            return true;
        };

        if (type === 'CHECK_HEALTH') return reply(checkHealth());
        if (type === 'RECOGNIZE_IMAGE') {
            return reply(recognizeByStoredId(message.storageKey || message.id));
        }
        if (type === 'TEST_RECOGNIZE_ALL') return reply(testRecognizeAll());
    });

    async function apiFetch(path, options = {}) {
        const url = `${API_BASE}${path}`;
        const bodyStr = options.body;
        const bodyBytes = bodyStr ? new TextEncoder().encode(bodyStr).length : 0;
        console.log(LOG, 'apiFetch 开始', {
            method: options.method || 'GET',
            url,
            bodyBytes,
            bodyMB: bodyBytes ? (bodyBytes / 1024 / 1024).toFixed(2) : 0,
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const t0 = Date.now();
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            let data = null;
            try {
                data = await response.json();
            } catch (parseErr) {
                console.warn(LOG, 'apiFetch JSON 解析失败', {
                    path,
                    status: response.status,
                    parseErr: parseErr?.message,
                });
                data = null;
            }
            console.log(LOG, 'apiFetch 响应', {
                path,
                ms: Date.now() - t0,
                status: response.status,
                ok: response.ok,
                dataOk: data?.ok,
                dataKeys: data ? Object.keys(data) : [],
            });
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
            console.error(LOG, 'apiFetch 异常', {
                path,
                ms: Date.now() - t0,
                name: error?.name,
                message: error?.message,
            });
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

    function summarizePayload(payload) {
        const b64 = String(payload?.imageBase64 || '');
        return {
            instructionLen: String(payload?.instruction || '').length,
            imageBase64Len: b64.length,
            hasDataUrlPrefix: /^data:image\/[^;]+;base64,/i.test(b64),
            createdAt: payload?.createdAt,
        };
    }

    async function recognizePayload(payload) {
        console.log(LOG, 'recognizePayload', summarizePayload(payload));
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
        console.log(LOG, 'recognizeByStoredId', { id });
        const payload = await loadRecognizePayload(id);

        if (!payload?.imageBase64) {
            console.error(LOG, 'recognizeByStoredId: storage 无图', { id, payload: !!payload });
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
