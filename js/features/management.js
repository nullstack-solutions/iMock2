'use strict';

window.refreshRequests = async () => {
    await fetchAndRenderRequests();
    const hasActiveFilters = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value;
    if (hasActiveFilters) FilterManager.applyRequestFilters();
};

window.applyQuickTimeFilter = () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateFromInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    if (dateFromInput) dateFromInput.value = Utils.formatDateTime(yesterday);
    if (dateToInput) dateToInput.value = Utils.formatDateTime(now);
    FilterManager.applyRequestFilters();
};

window.cleanupPendingDeletions = () => {
    for (const [id, timeout] of window.deletionTimeouts) {
        clearTimeout(timeout);
    }
    window.deletionTimeouts.clear();
    window.pendingDeletedIds.clear();
};

window.addEventListener('beforeunload', window.cleanupPendingDeletions);

window.toggleElementById = (elementId) => {
    const el = document.getElementById(elementId);
    if (el) el.classList.toggle('hidden');
};

window.togglePreview = (mappingId) => window.toggleElementById(`preview-${mappingId}`);
window.toggleRequestPreview = (requestId) => window.toggleElementById(`request-preview-${requestId}`);
