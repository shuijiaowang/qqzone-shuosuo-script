import { QQZoneGrabber } from '../core/qqzone.js';
import { showToast } from '../utils/ui/showToast.js';

export default defineContentScript({
    matches: ['https://user.qzone.qq.com/*'],
    runAt: 'document_idle',
    async main() {
        console.log('QQ空间说说抓取插件已加载');
        injectGrabButton();
        injectTestButton();
    },
});

function injectGrabButton() {
    if (document.getElementById('qq-grab-trigger-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'qq-grab-trigger-btn';
    btn.textContent = '📥 抓取说说';
    btn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        padding: 10px 20px;
        background: #3b82f6;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        transition: background 0.2s;
    `;

    btn.onmouseenter = () => {
        if (!btn.disabled) btn.style.background = '#2563eb';
    };
    btn.onmouseleave = () => {
        if (!btn.disabled) btn.style.background = '#3b82f6';
    };

    btn.addEventListener('click', () => QQZoneGrabber({ autoStart: true }));

    document.body.appendChild(btn);
}

function injectTestButton() {
    if (document.getElementById('qq-test-recognize-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'qq-test-recognize-btn';
    btn.textContent = '🧪 测试识别';
    btn.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: 999999;
        padding: 10px 20px;
        background: #10b981;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        transition: background 0.2s;
    `;

    btn.onmouseenter = () => {
        if (!btn.disabled) btn.style.background = '#059669';
    };
    btn.onmouseleave = () => {
        if (!btn.disabled) btn.style.background = '#10b981';
    };

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '⏳ 测试中...';
        
        try {
            console.log('[qqzone-content] 测试识别 开始');
            const t0 = Date.now();
            const response = await browser.runtime.sendMessage({ type: 'TEST_RECOGNIZE_ALL' });
            console.log('[qqzone-content] 测试识别 响应', {
                ms: Date.now() - t0,
                success: response?.success,
                error: response?.error,
            });
            
            if (response.success) {
                const data = response.data;
                console.log('测试识别接口返回:', data);
                if (data.results?.length) {
                    for (const item of data.results) {
                        if (item.success) {
                            console.log(`  [${item.id}] 成功:`, item.data);
                        } else {
                            console.warn(`  [${item.id}] 失败:`, item.error);
                        }
                    }
                }
                const successCount = data.results?.filter(r => r.success).length || 0;
                const failCount = data.results?.filter(r => !r.success).length || 0;
                
                showToast(`✅ 测试完成: ${data.count} 条数据, 成功 ${successCount} 条, 失败 ${failCount} 条`, 3000);
            } else {
                showToast(`❌ 测试失败: ${response.error}`, 3000);
            }
        } catch (error) {
            showToast(`❌ 测试请求失败: ${error.message}`, 3000);
        } finally {
            btn.disabled = false;
            btn.textContent = '🧪 测试识别';
        }
    });

    document.body.appendChild(btn);
}
