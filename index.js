import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const settings = {
    provider: {},
};
Object.assign(settings, extension_settings.customModels ?? {});

if (typeof settings.provider !== 'object' || settings.provider === null) {
    settings.provider = {};
}

// old popups, ancient ST
let popupCaller;
let popupType;
let popupResult;
try {
    const popup = await import('../../../popup.js');
    popupCaller = popup.callGenericPopup;
    popupType = popup.POPUP_TYPE;
    popupResult = popup.POPUP_RESULT;
} catch {
    popupCaller = (await import('../../../../script.js')).callPopup;
    popupType = {
        TEXT: 1,
    };
    popupResult = {
        AFFIRMATIVE: 1,
    };
}

const initializedSelects = new Set();

function initSelect(sel) {
    if (initializedSelects.has(sel)) return;
    initializedSelects.add(sel);

    const match = sel.id.match(/^model_(.+)_select$/);
    if (!match) return;
    const provider = match[1];

    if (provider.toLowerCase().startsWith('custom')) return;

    if (!settings.provider[provider]) {
        settings.provider[provider] = [];
    }
    const models = settings.provider[provider];

    // Find the H4 label for this select. First check previous siblings.
    let h4 = null;
    let sibling = sel.previousElementSibling;
    while (sibling) {
        if (sibling.tagName === 'H4') {
            h4 = sibling;
            break;
        }
        sibling = sibling.previousElementSibling;
    }
    // Fallback to parent's querySelector if not found in siblings
    if (!h4) {
        h4 = sel.parentElement?.querySelector('h4');
    }

    const btn = document.createElement('div');
    btn.classList.add('stcm--btn', 'menu_button', 'fa-solid', 'fa-fw', 'fa-pen-to-square');
    btn.title = 'Edit custom models';
    btn.addEventListener('click', async () => {
        let inp;
        const dom = document.createElement('div');
        const header = document.createElement('h3');
        header.textContent = `Custom Models: ${provider}`;
        dom.append(header);

        const hint = document.createElement('small');
        hint.textContent = 'one model name per line';
        dom.append(hint);

        inp = document.createElement('textarea');
        inp.classList.add('text_pole');
        inp.rows = 20;
        inp.value = models.join('\n');
        dom.append(inp);

        const prom = popupCaller(dom, popupType.TEXT, null, { okButton: 'Save' });
        const result = await prom;
        if (result == popupResult.AFFIRMATIVE) {
            while (models.pop());
            models.push(...inp.value.split('\n').filter(it => it.length));
            extension_settings.customModels = settings;
            saveSettingsDebounced();
            populateOptGroup();
            if (settings[`${provider}_model`] && models.includes(settings[`${provider}_model`])) {
                sel.value = settings[`${provider}_model`];
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

    if (h4) {
        h4.append(btn);
    } else {
        sel.after(btn);
    }

    const populateOptGroup = () => {
        grp.innerHTML = '';
        for (const model of models) {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            grp.append(opt);
        }
    };

    const grp = document.createElement('optgroup');
    grp.label = 'Custom Models';
    populateOptGroup();

    const updateGroups = () => {
        selectObserver.disconnect();

        // 1. Ensure our grp is the first child of sel
        if (sel.firstChild !== grp) {
            sel.insertBefore(grp, sel.firstChild);
        }

        // 2. Wrap raw option elements in a 'Versions' group to match SillyTavern's native styling
        const rawOptions = Array.from(sel.childNodes).filter(child => child.tagName === 'OPTION');
        if (rawOptions.length > 0) {
            let defaultGrp = sel.querySelector('optgroup[data-default-group="true"]');
            if (!defaultGrp) {
                defaultGrp = document.createElement('optgroup');
                defaultGrp.label = 'Versions';
                defaultGrp.dataset.defaultGroup = 'true';
            }
            for (const opt of rawOptions) {
                defaultGrp.appendChild(opt);
            }
            sel.appendChild(defaultGrp);
        }

        selectObserver.observe(sel, { childList: true });
    };

    const selectObserver = new MutationObserver(updateGroups);
    updateGroups();

    if (settings[`${provider}_model`] && models.includes(settings[`${provider}_model`])) {
        sel.value = settings[`${provider}_model`];
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    sel.addEventListener('change', (evt) => {
        evt.stopImmediatePropagation();
        if (settings[`${provider}_model`] != sel.value) {
            settings[`${provider}_model`] = sel.value;
            extension_settings.customModels = settings;
            saveSettingsDebounced();
        }
    });
}

function scan() {
    const selects = document.querySelectorAll('select[id^="model_"][id$="_select"]');
    selects.forEach(initSelect);
}

// Initial scan
scan();

// Mutation observer to dynamically detect new selectors as sections are rendered/loaded
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = /** @type {HTMLElement} */ (node);
                if (element.tagName === 'SELECT' && element.id.startsWith('model_') && element.id.endsWith('_select')) {
                    initSelect(/** @type {HTMLSelectElement} */ (element));
                } else {
                    const selects = element.querySelectorAll('select[id^="model_"][id$="_select"]');
                    selects.forEach(initSelect);
                }
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
