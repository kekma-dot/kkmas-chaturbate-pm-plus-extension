(function () {
  const STORAGE_KEY = "kkmaChaturbatePmPlusState";

  async function getState() {
    if (!globalThis.chrome?.storage?.local) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }

    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || {};
  }

  async function setState(nextState) {
    if (!globalThis.chrome?.storage?.local) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
  }

  async function patchState(patch) {
    const current = await getState();
    await setState({ ...current, ...patch });
  }

  window.CBMultichatStorage = {
    getState,
    setState,
    patchState,
    STORAGE_KEY
  };
})();
