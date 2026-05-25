import { storage } from '#imports';

/** 全局只保留一条识别载荷，新增时覆盖 */
const RECOGNIZE_STORAGE_ID = 'recognize_current';
const WXT_STORAGE_AREA_PREFIX = 'local:';

function toWxtStorageKey(id = RECOGNIZE_STORAGE_ID) {
    return id.startsWith(WXT_STORAGE_AREA_PREFIX) ? id : `${WXT_STORAGE_AREA_PREFIX}${id}`;
}

/**
 * 将图片识别载荷写入 extension local storage，避免 runtime message 携带大 base64。
 * 始终写入同一条记录，新数据覆盖旧数据。
 * @param {{instruction?: string, imageBase64?: string}} payload
 * @returns {Promise<string>} 固定存储 id，供 background 读取
 */
export async function saveRecognizePayload(payload) {
    await storage.setItem(toWxtStorageKey(), {
        ...payload,
        createdAt: Date.now(),
    });
    return RECOGNIZE_STORAGE_ID;
}

/**
 * 从 WXT storage 中加载识别载荷（固定单条）。
 * @param {string} [_id] - 兼容旧调用，忽略后始终读同一条
 * @returns {Promise<{instruction?: string, imageBase64?: string, createdAt?: number}|null>}
 */
export async function loadRecognizePayload(_id) {
    try {
        return (await storage.getItem(toWxtStorageKey())) || null;
    } catch (error) {
        console.error('加载识别载荷失败:', error);
        return null;
    }
}

/**
 * 删除暂存的识别载荷。
 * @param {string} [_id]
 * @returns {Promise<void>}
 */
export async function removeRecognizePayload(_id) {
    await storage.removeItem(toWxtStorageKey());
}

/**
 * 测试入口：返回当前唯一一条识别载荷（无则空数组）。
 * @returns {Promise<Array<{id: string, payload: {instruction?: string, imageBase64?: string}}>>}
 */
export async function listRecognizePayloads() {
    const payload = await loadRecognizePayload();
    if (!payload?.imageBase64) return [];
    return [{ id: RECOGNIZE_STORAGE_ID, payload }];
}
