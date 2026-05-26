/** content 侧 API 客户端：经 background 代理，规避页面 loopback / CORS 限制 */
import { loadRecognizePayload, saveRecognizePayload } from './recognize-storage.js';

const LOG = '[qqzone-api]';

/** @type {boolean | null} */
let serviceAvailable = null;
let serviceWarned = false;

function summarizePayload(payload) {
    const b64 = String(payload?.imageBase64 || '');
    return {
        instructionLen: String(payload?.instruction || '').length,
        imageBase64Len: b64.length,
        hasDataUrlPrefix: /^data:image\/[^;]+;base64,/i.test(b64),
    };
}

function warnServiceOnce(message) {
    if (serviceWarned) return;
    serviceWarned = true;
    console.warn(LOG, message);
    const status = document.getElementById('qq-grab-status');
    if (status && !status.textContent.includes('识别服务')) {
        status.textContent += '（图片识别服务未连接，图片将标记为 [图片]）';
    }
}

async function sendBackground(type, extra = {}) {
    const extraKeys = Object.keys(extra).filter((k) => k !== 'imageBase64' && k !== 'token');
    console.log(LOG, 'sendMessage → background', { type, extraKeys, hasToken: !!extra.token });
    const t0 = Date.now();
    let response;
    try {
        response = await browser.runtime.sendMessage({ type, ...extra });
    } catch (error) {
        console.error(LOG, 'sendMessage 抛错', {
            type,
            ms: Date.now() - t0,
            name: error?.name,
            message: error?.message,
        });
        throw error;
    }
    console.log(LOG, 'sendMessage ← background', {
        type,
        ms: Date.now() - t0,
        hasResponse: response != null,
        success: response?.success,
        error: response?.error,
        dataOk: response?.data?.ok,
        dataKeys: response?.data ? Object.keys(response.data) : [],
    });
    if (!response) {
        throw new Error('background 未响应，请重新加载扩展');
    }
    return response;
}

export function resetRecognizeService() {
    console.log(LOG, 'resetRecognizeService', { was: serviceAvailable });
    serviceAvailable = null;
    serviceWarned = false;
}

export async function isRecognizeServiceAvailable() {
    if (serviceAvailable === false) {
        console.log(LOG, 'isRecognizeServiceAvailable: 缓存=false，跳过');
        return false;
    }
    if (serviceAvailable === true) {
        console.log(LOG, 'isRecognizeServiceAvailable: 缓存=true，跳过 health');
        return true;
    }

    console.log(LOG, 'isRecognizeServiceAvailable: 请求 CHECK_HEALTH');
    try {
        const response = await sendBackground('CHECK_HEALTH');
        serviceAvailable = response.success === true;
        console.log(LOG, 'CHECK_HEALTH 结果', {
            serviceAvailable,
            healthData: response.data,
            error: response.error,
        });
        if (!serviceAvailable) {
            warnServiceOnce(
                `⚠️ 本地识别服务不可用，请确认 http://127.0.0.1:3840 已启动。${response.error || ''}`,
            );
        }
        return serviceAvailable;
    } catch (error) {
        serviceAvailable = false;
        console.error(LOG, 'CHECK_HEALTH 异常', error);
        warnServiceOnce(`⚠️ 本地识别服务不可用: ${error.message}`);
        return false;
    }
}

/** @param {{ instruction: string, imageBase64: string }} payload @param {string} token */
export async function recognizeImage(payload, token) {
    console.log(LOG, 'recognizeImage 开始', summarizePayload(payload));

    const trimmedToken = String(token || '').trim();
    if (!trimmedToken) {
        console.warn(LOG, 'recognizeImage 中止: 未配置 Token');
        return null;
    }

    if (serviceAvailable === false) {
        console.warn(LOG, 'recognizeImage 中止: serviceAvailable 已为 false');
        return null;
    }

    const available = await isRecognizeServiceAvailable();
    if (!available) {
        console.warn(LOG, 'recognizeImage 中止: 服务不可用');
        return null;
    }

    let storageKey = '';

    try {
        storageKey = await saveRecognizePayload(payload);

        const verify = await loadRecognizePayload(storageKey);
        console.log(LOG, 'save 后 content 侧回读', {
            storageKey,
            verifyOk: !!verify?.imageBase64,
            savedLen: payload?.imageBase64?.length ?? 0,
            loadedLen: verify?.imageBase64?.length ?? 0,
            lenMatch: (payload?.imageBase64?.length ?? 0) === (verify?.imageBase64?.length ?? 0),
        });

        const response = await sendBackground('RECOGNIZE_IMAGE', { storageKey, token: trimmedToken });

        if (response.success && response.data?.ok) {
            console.log(LOG, 'recognizeImage 成功', {
                contentLen: String(response.data?.content || '').length,
                model: response.data?.model,
            });
            return response.data;
        }

        console.warn(LOG, 'recognizeImage 返回异常', {
            success: response.success,
            error: response.error,
            dataOk: response?.data?.ok,
            data: response.data,
        });
        return null;
    } catch (error) {
        serviceAvailable = false;
        console.error(LOG, 'recognizeImage catch', {
            name: error?.name,
            message: error?.message,
            storageKey,
        });
        warnServiceOnce(`⚠️ 图片识别请求失败，后续图片将跳过识别: ${error.message}`);
        return null;
    }
}

/** @param {string} token */
export async function testRecognizeConnection(token) {
    const trimmedToken = String(token || '').trim();
    if (!trimmedToken) {
        return { ok: false, error: '请先填写 Token' };
    }

    try {
        const response = await sendBackground('TEST_RECOGNIZE', { token: trimmedToken });
        if (response.success && response.data?.ok) {
            serviceAvailable = true;
            serviceWarned = false;
            return { ok: true, data: response.data };
        }
        return {
            ok: false,
            error: response.error || response.data?.error?.message || '测试识别失败',
        };
    } catch (error) {
        serviceAvailable = false;
        return { ok: false, error: error.message };
    }
}
