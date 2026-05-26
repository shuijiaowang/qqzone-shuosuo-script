import { openGrabPanelFromTrigger, syncGrabButtonState } from '../core/qqzone.js';

export default defineContentScript({
    matches: ['https://user.qzone.qq.com/*'],
    runAt: 'document_idle',
    async main() {
        console.log('QQ空间说说抓取插件已加载');
        injectGrabButton();
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
        if (!btn.disabled && !btn.classList.contains('qq-grab-disabled-auth')) {
            btn.style.background = '#3b82f6';
        }
    };

    btn.addEventListener('click', async () => {
        await openGrabPanelFromTrigger();
    });

    document.body.appendChild(btn);
    void syncGrabButtonState();
}
