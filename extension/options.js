const api = typeof browser !== 'undefined' ? browser : chrome;
const input = document.getElementById('site');
api.storage.sync.get('site').then(({ site }) => { input.value = site || 'https://emufriends.pet/park'; });
document.getElementById('save').addEventListener('click', async () => {
  await api.storage.sync.set({ site: input.value.trim().replace(/\/+$/, '') });
  document.getElementById('ok').hidden = false;
});
