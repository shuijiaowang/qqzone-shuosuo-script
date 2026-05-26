import { loadRecognizePayload } from '../core/recognize-storage.js';

const API_BASE = 'http://127.0.0.1:3840';

/** 识图模式连通性测试（固定小图，不读 storage） */
const TEST_RECOGNIZE_PAYLOAD = {
    instruction: '返回`测试成功`,用于接口测试',
    imageBase64:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHESURBVHgBjVNNMgNREO5vxE+VhbmBbP1VcQJxgziA5NkwVuIE4QSRlbCacAC5QY5glGCZcYNYKKu89vUwaihEL+Z1Xnd/+frrfpBv1hi68PVFr1V0HSIjnu2L1atT+cWC7xcsboloJVDpiiKBoBXducpvALBPlgCtm+9Fq4Gg11nt7robF85M+yGTUgIlSkaYQruzFKefDKL7WlPh+16kqpAKgJEX3Fow3ohHBEsECC1GZg0d+3706Mo5QElVHKn2Lta62z9RJJOt3LdCP/Y3MvYNkyvXoAzRW/mHGXWAbQgWPluwjwKbRVqTjO2s58KyRaSmOnsbHjy46qRiKFK2XTbd9gY7jWwKpvbstPbpjs4LPf9l0aDet13JWjC1RSXlmEL5pzE35RGWorvaMTVY5FWVdNqTCt9pB5bvKGZcoiBNWxBu3kln7fJ4EgD35JAahBQvnpvHUckuA9V2sXiPy0V0JwYMnJwtx70iCPvONvXD/2r7g3oLKgaWsNHQe39dfAv27xTvOf+dMcj2gFqYz7fgjF5nJX8LOuTsmoxXLI/ZIRAkXwCyPch2/eN1qT7ZYdPZv69xQu9x04rBo/OVOM4B3gCn4dLeryIYgQAAAABJRU5ErkJggg==',
};
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
            return reply(recognizeByStoredId(message.storageKey || message.id, message.token));
        }
        if (type === 'TEST_RECOGNIZE') return reply(testRecognize(message.token));
    });

    function buildAuthHeaders(token) {
        const headers = { 'Content-Type': 'application/json' };
        const trimmed = String(token || '').trim();
        if (trimmed) {
            headers.Authorization = `Bearer ${trimmed}`;
        }
        return headers;
    }

    async function apiFetch(path, options = {}) {
        const url = `${API_BASE}${path}`;
        const bodyStr = options.body;
        const bodyBytes = bodyStr ? new TextEncoder().encode(bodyStr).length : 0;
        console.log(LOG, 'apiFetch 开始', {
            method: options.method || 'GET',
            url,
            bodyBytes,
            bodyMB: bodyBytes ? (bodyBytes / 1024 / 1024).toFixed(2) : 0,
            hasAuth: !!options.headers?.Authorization,
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

    async function recognizePayload(payload, token) {
        console.log(LOG, 'recognizePayload', summarizePayload(payload));
        const trimmedToken = String(token || '').trim();
        if (!trimmedToken) {
            throw new Error('缺少 Token，请在识图模式中填写');
        }
        const body = prepareRecognizeBody(payload);
        if (!body.instruction) {
            throw new Error('instruction 为空');
        }
        if (!body.imageBase64) {
            throw new Error('imageBase64 为空');
        }
        const result = await apiFetch('/api/qq-zone/recognize-image', {
            method: 'POST',
            headers: buildAuthHeaders(trimmedToken),
            body: JSON.stringify(body),
        });
        console.log('[recognize-image] 接口返回:', result);
        return result;
    }

    /** 先由 content 写入 WXT storage，再通知；此处读取后请求本地 API */
    async function recognizeByStoredId(id, token) {
        console.log(LOG, 'recognizeByStoredId', { id });
        const payload = await loadRecognizePayload(id);

        if (!payload?.imageBase64) {
            console.error(LOG, 'recognizeByStoredId: storage 无图', { id, payload: !!payload });
            throw new Error('未找到待识别的图片数据');
        }

        return recognizePayload(payload, token);
    }

    /** 识图模式连通性测试（固定 payload，不读 storage） */
    async function testRecognize(token) {
        const trimmedToken = String(token || '').trim();
        if (!trimmedToken) {
            throw new Error('请先填写 Token');
        }
        return recognizePayload(TEST_RECOGNIZE_PAYLOAD, trimmedToken);
    }
});
