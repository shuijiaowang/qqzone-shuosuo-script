// core/config.js

/** 发给本地识别服务的图片 instruction（控制模型输出风格） */
export const IMAGE_RECOGNIZE_INSTRUCTION = `你是 QQ 空间说说配图识别助手。只输出识别结果，不要前言、总结、markdown、编号或“根据图片”等套话。

规则：
1. 若图片以文字为主（聊天记录、文档、截图、海报、界面文字等）：只输出图中可见文字的原文，尽量保持换行，不要概括、翻译或补充未出现的字。
2. 若是生活照、风景、人物、物品等非文字类照片：用一两句客观描述画面可见内容，不猜测情绪、不评价、不提“这张图片”。

只输出上述结果本身。`;

/** @param {string} [textContext] 本条说说/转发原文，仅作识图参考 */
export function buildImageRecognizeInstruction(textContext = '') {
    const text = String(textContext || '').trim();
    if (!text) return IMAGE_RECOGNIZE_INSTRUCTION;
    return `${IMAGE_RECOGNIZE_INSTRUCTION}

参考用户的说说原文（仅供理解配图侧重点；勿复述、勿照搬原文；仍以图中可见事实为准，客观描述）：
「${text}」`;
}

export const APP_CONFIG = {
    // 快捷键配置
    KEYBOARD: {},
    // UI配置
    UI: {}
};
// ... (保留 DEFAULT_DOMAIN_CONFIG) ...
export const DEFAULT_DOMAIN_CONFIG = {
    pluginEnabled: false,
};
export const appState = {
    //--------该网站独有的存储属性-------
    domainConfigStorage : storage.defineItem(`local:${window.location.hostname}`, {
        fallback: DEFAULT_DOMAIN_CONFIG //不存在则返回默认值
    }),
    domainConfig: {
        isPluginEnabled: false, //是否启用插件
    },
    saveDomainConfig:async () => {
        await appState.domainConfigStorage.setValue(appState.domainConfig)
    }
};
