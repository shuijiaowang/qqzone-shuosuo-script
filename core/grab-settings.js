import { storage } from '#imports';

export const GRAB_MODE_NORMAL = 'normal';
export const GRAB_MODE_RECOGNIZE = 'recognize';

const grabModeItem = storage.defineItem('local:qq-grab-mode', {
    fallback: GRAB_MODE_NORMAL,
});

const recognizeTokenItem = storage.defineItem('local:qq-recognize-token', {
    fallback: '',
});

const recognizeTestPassedItem = storage.defineItem('local:qq-recognize-test-passed', {
    fallback: false,
});

export async function getGrabMode() {
    return grabModeItem.getValue();
}

/** @param {typeof GRAB_MODE_NORMAL | typeof GRAB_MODE_RECOGNIZE} mode */
export async function setGrabMode(mode) {
    await grabModeItem.setValue(mode);
    if (mode === GRAB_MODE_RECOGNIZE) {
        await recognizeTestPassedItem.setValue(false);
    }
}

export async function getRecognizeToken() {
    return String((await recognizeTokenItem.getValue()) || '').trim();
}

/** @param {string} token */
export async function setRecognizeToken(token) {
    const next = String(token || '').trim();
    const prev = String((await recognizeTokenItem.getValue()) || '').trim();
    await recognizeTokenItem.setValue(next);
    if (next !== prev) {
        await recognizeTestPassedItem.setValue(false);
    }
}

export async function isRecognizeTestPassed() {
    return (await recognizeTestPassedItem.getValue()) === true;
}

/** @param {boolean} passed */
export async function setRecognizeTestPassed(passed) {
    await recognizeTestPassedItem.setValue(!!passed);
}

