// import {defineContentScript} from "#imports"; //可省略

export default defineContentScript({
    matches: ['https://user.qzone.qq.com/*'], //全匹配
    runAt: 'document_idle',//页面完全加载完成
    // 脚本注入后执行的核心逻辑
    async main() {
        // 调用业务模块的初始化函数
        console.log("插件初始化")
    },
});
