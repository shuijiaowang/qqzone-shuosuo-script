/** content 侧 API 客户端：经 background 代理，规避页面 loopback / CORS 限制 */
import { saveRecognizePayload } from './recognize-storage.js';

/** @type {boolean | null} */
let serviceAvailable = null;
let serviceWarned = false;

function warnServiceOnce(message) {
    if (serviceWarned) return;
    serviceWarned = true;
    console.warn(message);
    const status = document.getElementById('qq-grab-status');
    if (status && !status.textContent.includes('识别服务')) {
        status.textContent += '（图片识别服务未连接，图片将标记为 [图片]）';
    }
}

async function sendBackground(type, extra = {}) {
    const response = await browser.runtime.sendMessage({ type, ...extra });
    if (!response) {
        throw new Error('background 未响应，请重新加载扩展');
    }
    return response;
}

export function resetRecognizeService() {
    serviceAvailable = null;
    serviceWarned = false;
}

export async function isRecognizeServiceAvailable() {
    if (serviceAvailable === false) return false;
    if (serviceAvailable === true) return true;

    try {
        const response = await sendBackground('CHECK_HEALTH');
        serviceAvailable = response.success === true;
        if (!serviceAvailable) {
            warnServiceOnce(
                `⚠️ 本地识别服务不可用，请确认 http://127.0.0.1:3840 已启动。${response.error || ''}`,
            );
        }
        return serviceAvailable;
    } catch (error) {
        serviceAvailable = false;
        warnServiceOnce(`⚠️ 本地识别服务不可用: ${error.message}`);
        return false;
    }
}

/** @param {{ instruction: string, imageBase64: string }} payload */
export async function recognizeImage(payload) {
    if (serviceAvailable === false) return null;

    const available = await isRecognizeServiceAvailable();
    if (!available) return null;

    let storageKey = '';

    try {
        storageKey = await saveRecognizePayload(payload);
        const response = await sendBackground('RECOGNIZE_IMAGE', { storageKey });

        if (response.success && response.data?.ok) {
            return response.data;
        }

        console.warn('⚠️ 图片识别返回异常:', response.error || response.data);
        return null;
    } catch (error) {
        serviceAvailable = false;
        warnServiceOnce(`⚠️ 图片识别请求失败，后续图片将跳过识别: ${error.message}`);
        return null;
    }
}
