// Offscreen document: service workers have no URL.createObjectURL, so blob creation happens here.
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === 'XCAP_MAKE_BLOB_URL') {
    const url = URL.createObjectURL(new Blob([msg.json], { type: 'application/json' }));
    send({ url });
  }
  return false;
});
