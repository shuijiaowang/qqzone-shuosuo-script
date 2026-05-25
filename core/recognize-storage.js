import { storage } from '#imports';

/** 全局只保留一条识别载荷，新增时覆盖 */
const RECOGNIZE_STORAGE_ID = 'recognize_current';
const WXT_STORAGE_AREA_PREFIX = 'local:';

function toWxtStorageKey(id = RECOGNIZE_STORAGE_ID) {
    return id.startsWith(WXT_STORAGE_AREA_PREFIX) ? id : `${WXT_STORAGE_AREA_PREFIX}${id}`;
}

/** 日志用：不打印完整 base64 */
function summarizePayload(payload, label = 'payload') {
    const b64 = String(payload?.imageBase64 || '');
    const hasDataUrl = /^data:image\/[^;]+;base64,/i.test(b64);
    return {
        label,
        instructionLen: String(payload?.instruction || '').length,
        imageBase64Len: b64.length,
        hasDataUrlPrefix: hasDataUrl,
        imageMime: payload?.imageMime || null,
        createdAt: payload?.createdAt || null,
    };
}

/**
 * 将图片识别载荷写入 extension local storage，避免 runtime message 携带大 base64。
 * 始终写入同一条记录，新数据覆盖旧数据。
 * @param {{instruction?: string, imageBase64?: string}} payload
 * @returns {Promise<string>} 固定存储 id，供 background 读取
 */
export async function saveRecognizePayload(payload) {
    const key = toWxtStorageKey();
    const item = { ...payload, createdAt: Date.now() };
    console.log('[recognize-storage] save 开始', { key, ...summarizePayload(item, 'save') });
    const t0 = Date.now();
    await storage.setItem(key, item);
    console.log('[recognize-storage] save 完成', { key, ms: Date.now() - t0 });
    return RECOGNIZE_STORAGE_ID;
}

/**
 * 从 WXT storage 中加载识别载荷（固定单条）。
 * @param {string} [_id] - 兼容旧调用，忽略后始终读同一条
 * @returns {Promise<{instruction?: string, imageBase64?: string, createdAt?: number}|null>}
 */
export async function loadRecognizePayload(_id) {
    const key = toWxtStorageKey(_id);
    try {
        const t0 = Date.now();
        const payload = (await storage.getItem(key)) || null;
        console.log('[recognize-storage] load', {
            key,
            ms: Date.now() - t0,
            found: !!payload,
            ...(payload ? summarizePayload(payload, 'load') : {}),
        });
        return payload;
    } catch (error) {
        console.error('[recognize-storage] load 失败', { key, error });
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
