let selectedRating = 0;
let feedbackTicketId = null;
function openFeedbackModal(id) { feedbackTicketId = id; document.getElementById('feedbackTicketId').textContent = id; selectedRating = 0; updateStars(0); showModal('feedbackModal'); }
function closeFeedbackModal() { hideModal('feedbackModal'); feedbackTicketId = null; }
function setRating(n) { selectedRating = n; updateStars(n); }
function updateStars(n) {
  document.querySelectorAll('.feedback-star').forEach((s, i) => {
    s.classList.toggle('text-amber-400', i < n); s.classList.toggle('fill-amber-400', i < n); s.classList.toggle('text-slate-300', i >= n);
  });
}
async function submitFeedback() {
  if (selectedRating === 0) return showToast('Please select a rating before submitting.', 'warning');
  if (!feedbackTicketId) return;
  try {
    await window.API.submitFeedback(feedbackTicketId, selectedRating);
    showToast(`Thank you! Your ${selectedRating}-star feedback has been recorded.`, 'success');
    closeFeedbackModal();
  } catch (err) {
    console.error(err);
    showToast('Failed to save feedback: ' + err.message, 'error');
  }
}
