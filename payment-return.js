document.getElementById('payment-retry').addEventListener('click', async function () {
  this.disabled = true;
  try { await DKCOMMERCE.init(); await DKCOMMERCE.completeWebPayment(); }
  catch (error) { document.getElementById('commerce-status').textContent = DKCOMMERCE.errorText(error); }
  finally { this.disabled = false; }
});
