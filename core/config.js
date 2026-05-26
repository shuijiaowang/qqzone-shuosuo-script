// core/config.js

/** 发给本地识别服务的图片 instruction（控制模型输出风格） */
export const IMAGE_RECOGNIZE_INSTRUCTION = `你是 QQ 空间说说配图识别助手。只输出识别结果，不要前言、总结、markdown、编号或“根据图片”等套话。

核心原则：先说明「这是什么场景/物品/画面」，再补充图中可见文字；不要把整张图当成纯文字 OCR，也不要只摘局部文字而忽略主体，除非背景色统一就是文字截图才可以。

规则：
1. 物品、人物、风景、生活照等：用一两句客观描述画面主体与可见细节。图中有文字时，作为画面一部分简要写出（例如「一把折扇，扇面写有……」），不要只输出文字而忽略是什么东西。
2. 以文字为主的截图（聊天记录、文档页、纯海报排版等）：可主要输出可见文字原文，尽量保持换行；若仍有明显场景或界面元素，可简短点出。
3. 不猜测情绪、不评价、不提“这张图片”；不要翻译、概括或补充图中未出现的内容。

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
