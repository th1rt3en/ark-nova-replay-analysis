const api = typeof browser !== 'undefined' ? browser : chrome;
const input = document.getElementById('site');
api.storage.sync.get('site').then(({ site }) => { input.value = site || 'https://ark-nova-replay-analysis-725889947830.us-central1.run.app'; });
document.getElementById('save').addEventListener('click', async () => {
  await api.storage.sync.set({ site: input.value.trim().replace(/\/+$/, '') });
  document.getElementById('ok').hidden = false;
});
