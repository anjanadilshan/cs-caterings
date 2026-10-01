(() => {
  const client = window.csSupabase;
  const message = document.getElementById('requestsMessage');
  const host = document.getElementById('requestList');
  const approved = new Set(['confirmed', 'in_progress', 'completed']);
  const closed = new Set(['cancelled', 'rejected']);
  const labels = { pending: 'Pending review', under_review: 'Under review', quoted: 'Quotation ready', confirmed: 'Approved', in_progress: 'Approved · in progress', completed: 'Approved · completed', cancelled: 'Cancelled', rejected: 'Declined' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Date not set';
  async function load() {
    if (!client) { message.textContent = 'Booking services are unavailable. Please try again later.'; return; }
    const { data: { user } = {}, error: authError } = await client.auth.getUser();
    if (authError || !user) { message.innerHTML = 'Please <a href="../../user-login/login.html">sign in</a> to view your event requests.'; return; }
    const { data, error } = await client.from('event_bookings').select('id,booking_reference,event_type,event_date,guest_count,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) { console.error('Could not load event requests:', error); message.textContent = 'We could not load your requests. Please refresh and try again.'; return; }
    message.className = 'notice'; message.textContent = '';
    if (!data?.length) { host.innerHTML = '<div class="request-empty">You have no event requests yet. <a href="../index.html">Book your first event</a>.</div>'; return; }
    host.innerHTML = data.map(booking => {
      const status = booking.status || 'pending';
      const badgeClass = approved.has(status) ? 'approved' : closed.has(status) ? 'closed' : '';
      const reference = booking.booking_reference || 'Booking request';
      return `<article class="request-card"><div class="request-card-header"><div><h2>${esc(reference)}</h2><p>${esc(booking.event_type || 'Event')} · ${date(booking.event_date)} · ${Number(booking.guest_count || 0).toLocaleString()} guests</p></div><span class="request-status ${badgeClass}">${esc(labels[status] || status.replaceAll('_', ' '))}</span></div><div class="form-actions"><a class="secondary-button" href="booking-details.html?id=${encodeURIComponent(booking.id)}">View details</a></div></article>`;
    }).join('');
  }
  load();
})();
