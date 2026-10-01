(() => {
  const client = window.csSupabase;
  const isAdminPreview = new URLSearchParams(window.location.search).get('adminPreview') === '1';
  if (isAdminPreview) document.documentElement.classList.add('admin-form-preview');
  const form = document.getElementById('bookingForm');
  const steps = [...document.querySelectorAll('.form-step')];
  const markers = [...document.querySelectorAll('[data-step-marker]')];
  const nextButton = document.getElementById('nextStep');
  const previousButton = document.getElementById('previousStep');
  const notice = document.getElementById('formMessage');
  const rentalItems = [];
  const selectedRentals = new Map();
  const formOptions = [];
  const formLayouts = {};
  let currentStep = 0;
  let signedInUser = null;

  const value = name => form.elements.namedItem(name)?.value?.trim() || '';
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = amount => amount == null ? 'Price to be quoted' : new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(amount));
  function message(text, type = 'error') { notice.textContent = text; notice.className = `notice show ${type}`; notice.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  function clearMessage() { notice.textContent = ''; notice.className = 'notice'; }
  function showStep(index, notifyParent = true) {
    currentStep = index;
    steps.forEach((step, i) => step.classList.toggle('active', i === index));
    markers.forEach((marker, i) => { marker.classList.toggle('active', i === index); marker.classList.toggle('done', i < index); });
    previousButton.hidden = index === 0;
    nextButton.hidden = index === steps.length - 1;
    if (index === 5) renderSummary();
    clearMessage();
    if(isAdminPreview&&notifyParent&&window.parent!==window)window.parent.postMessage({type:'cs-customer-preview-step',step:index},location.origin);
    document.querySelector('.step-layout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function validateStep(index) {
    const fields = [...steps[index].querySelectorAll('input,select,textarea')].filter(field => field.required && field.type !== 'checkbox');
    for (const field of fields) {
      if (!field.checkValidity()) { field.reportValidity(); return false; }
    }
    if (index === 0) {
      const phonePattern = /^[+0-9() .-]{7,24}$/;
      if (!phonePattern.test(value('customer_phone'))) { message('Enter a valid phone number using 7â€“24 digits or phone characters.'); form.elements.customer_phone.focus(); return false; }
      if (value('alternative_phone') && !phonePattern.test(value('alternative_phone'))) { message('Check the alternative phone number.'); form.elements.alternative_phone.focus(); return false; }
    }
    if (index === 1) {
      const date = value('event_date');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (date && new Date(`${date}T00:00:00`) < today) { message('Choose today or a future event date.'); return false; }
      if (value('start_time') && value('end_time') && value('end_time') <= value('start_time')) { message('The end time must be later than the start time.'); return false; }
    }
    const layout = formLayouts[index + 1] || [];
    for (const field of layout.filter(field => field.custom && field.required)) {
      const controls = [...form.querySelectorAll(`[name="${CSS.escape(field.id)}"]`)];
      const valid = field.type === 'checkbox' || field.type === 'radio' ? controls.some(control => control.checked) : Boolean(controls[0]?.value?.trim());
      if (!valid) { message(`${field.label} is required.`); controls[0]?.focus(); return false; }
    }
    return true;
  }
  nextButton.addEventListener('click', () => { if (validateStep(currentStep)) showStep(currentStep + 1); });
  previousButton.addEventListener('click', () => showStep(Math.max(0, currentStep - 1)));
  markers.forEach(marker => marker.addEventListener('click', () => { const target = Number(marker.dataset.stepMarker); if (target < currentStep) showStep(target); }));
  if(isAdminPreview)window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='cs-admin-preview-step')showStep(Number(event.data.step),false);});

  async function loadProfile() {
    if(isAdminPreview){document.getElementById('accountHint').textContent='Admin preview of the customer form. Submitting is disabled.';return;}
    if (!client) return;
    const { data: { user } = {} } = await client.auth.getUser();
    signedInUser = user || null;
    const link = document.getElementById('accountLink');
    if (!user) { document.getElementById('accountHint').textContent = 'Sign in to submit and track your booking request.'; return; }
    link.textContent = user.email?.split('@')[0] || 'Account';
    link.href = '../user-login/login.html';
    const email = form.elements.customer_email;
    email.value = user.email || '';
    email.readOnly = Boolean(user.email);
    const { data, error } = await client.from('profiles').select('full_name, phone_number').eq('id', user.id).maybeSingle();
    if (error) console.warn('Could not load customer profile:', error);
    form.elements.customer_name.value = data?.full_name || user.user_metadata?.full_name || '';
    form.elements.customer_phone.value = data?.phone_number || user.user_metadata?.phone_number || '';
    document.getElementById('accountHint').textContent = 'Your signed-in profile details have been filled in where available.';
  }
  async function loadFormOptions() {
    if (!client) return;
    const { data, error } = await client.from('event_booking_form_options').select('option_type,label').eq('is_active', true).order('sort_order').order('label');
    if (error) { console.error('Could not load request form choices:', error); message('We could not load current event and dietary choices. Please refresh and try again.'); return; }
    formOptions.splice(0, formOptions.length, ...(data || []));
    const eventSelect = form.elements.event_type;
    const currentEvent = eventSelect.value;
    eventSelect.replaceChildren(new Option('Choose event type', ''));
    formOptions.filter(option => option.option_type === 'event_type').forEach(option => eventSelect.add(new Option(option.label, option.label)));
    if ([...eventSelect.options].some(option => option.value === currentEvent)) eventSelect.value = currentEvent;
    const dietaryHost = document.getElementById('dietaryChoices');
    dietaryHost.replaceChildren();
    const dietaryOptions = formOptions.filter(option => option.option_type === 'dietary_requirement');
    if (!dietaryOptions.length) { dietaryHost.textContent = 'No dietary choices are currently available.'; return; }
    dietaryOptions.forEach(option => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'dietary'; checkbox.value = option.label;
      label.append(checkbox, document.createTextNode(` ${option.label}`));
      dietaryHost.append(label);
    });
  }
  function fieldLabelNode(field) {
    const section = steps[field.step - 1];
    if (field.key === 'preferred_contact_method') return section.querySelector('[data-layout-key="preferred_contact_method"] legend');
    if (field.key === 'dietary_requirements') return section.querySelector('[data-layout-key="dietary_requirements"] legend');
    if (field.custom) return null;
    const wrapper = [...section.querySelectorAll('[data-layout-key]')].find(node => node.dataset.layoutKey === field.key);
    return wrapper?.tagName === 'LABEL' ? wrapper : null;
  }

  function renderCustomField(field, stepNumber) {
    const wrapper = document.createElement('div'); wrapper.className = 'custom-booking-field'; wrapper.dataset.customFieldId = field.id;
    const label=document.createElement('label');label.className='custom-booking-field-label';label.textContent=`${field.label}${field.required ? ' *' : ''}`;wrapper.append(label);
    const makeInput = (type, value = '') => { const input=document.createElement('input'); input.type=type; input.name=field.id; input.value=value; input.required=Boolean(field.required)&&!['checkbox','radio'].includes(type); if(type==='number'){input.min='0';input.step='any';} return input; };
    if (field.type === 'textarea') { const input=document.createElement('textarea');input.name=field.id;input.rows=3;input.required=Boolean(field.required);input.id=field.id;label.htmlFor=field.id;wrapper.append(input); }
    else if (field.type === 'select') { const select=document.createElement('select');select.name=field.id;select.required=Boolean(field.required);select.id=field.id;label.htmlFor=field.id;select.add(new Option('Choose an option',''));(field.options||[]).forEach(option=>select.add(new Option(option,option)));wrapper.append(select); }
    else if (field.type === 'checkbox' || field.type === 'radio') { const choices=document.createElement('span');choices.className='choice-row wrap custom-choice-options';(field.options||[]).forEach(option=>{const choice=document.createElement('label');const input=makeInput(field.type,option);choice.append(input,document.createTextNode(option));choices.append(choice);});wrapper.append(choices); }
    else { const input=makeInput(field.type);input.id=field.id;label.htmlFor=field.id;wrapper.append(input); }
    return wrapper;
  }

  function applyFormLayouts(rows) {
    rows.forEach(row => {
      const stepNumber=Number(row.step_number), fields=Array.isArray(row.fields)?row.fields:[];
      fields=fields.filter(field=>!['catering_package_id','service_selection'].includes(field.key));
      formLayouts[stepNumber]=fields;
      const section=steps[stepNumber-1]; if(!section)return;
      const byKey=new Map(fields.filter(field=>!field.custom).map(field=>[field.key,field]));
      section.querySelectorAll('[data-layout-key]').forEach(wrapper=>{
        const field=byKey.get(wrapper.dataset.layoutKey);
        wrapper.hidden=!field;
        if(!field)return;
        const legend=wrapper.querySelector('legend');
        if(legend)legend.textContent=field.label;
        else if(wrapper.tagName==='LABEL'){
          const input=wrapper.querySelector('input,select,textarea');
          [...wrapper.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
          wrapper.insertBefore(document.createTextNode(`${field.label}${field.required?' *':''}`),input);
          if(input && 'required' in input)input.required=Boolean(field.required);
        } else {
          let title=wrapper.querySelector(':scope > .layout-custom-label');
          if(!title){title=document.createElement('p');title.className='layout-custom-label';wrapper.prepend(title);}
          title.textContent=field.label;
        }
        if(field.key==='preferred_contact_method') {
          const choices=wrapper.querySelector('.choice-row');
          if(choices) {
            const current=choices.querySelector('input:checked')?.value;
            const options=Array.isArray(field.options)&&field.options.length?field.options:['WhatsApp','Phone Call','Email'];
            choices.replaceChildren(...options.map((option,index)=>{
              const label=document.createElement('label');
              const input=document.createElement('input');input.type='radio';input.name='preferred_contact_method';input.value=option;
              input.checked=option===current||(!current&&index===0);
              label.append(input,document.createTextNode(` ${option}`));
              return label;
            }));
          }
        }
      });
      const customHost=document.getElementById(`custom-fields-step-${stepNumber}`);
      if(customHost){customHost.replaceChildren(...fields.filter(field=>field.custom).map(field=>renderCustomField(field,stepNumber)));}
      const layoutHost=section.querySelector(`[data-layout-step="${stepNumber}"]`);
      if(layoutHost){fields.filter(field=>!field.custom).forEach(field=>{const node=[...layoutHost.querySelectorAll('[data-layout-key]')].find(item=>item.dataset.layoutKey===field.key);if(node)layoutHost.append(node);});}
    });
  }

  async function loadFormLayouts() {
    if(!client)return;
    const {data,error}=await client.from('event_booking_form_layouts').select('step_number,fields').order('step_number');
    if(error){console.error('Could not load customized form fields:',error);return;}
    applyFormLayouts(data||[]);
  }

  function collectCustomFieldAnswers() {
    const answers=[];
    Object.values(formLayouts).flat().filter(field=>field.custom).forEach(field=>{
      const controls=[...form.querySelectorAll(`[name="${CSS.escape(field.id)}"]`)];
      const response=['checkbox','radio'].includes(field.type)?controls.filter(control=>control.checked).map(control=>control.value).join(', '):(controls[0]?.value||'').trim();
      if(response)answers.push(`${field.label}: ${response}`);
    });
    return answers.length?`Additional form responses:\n${answers.join('\n')}`:'';
  }
  async function loadRentals() {
    const status = document.getElementById('rentalStatus');
    if (!client) { status.textContent = 'Rental inventory could not be connected.'; return; }
    const { data, error } = await client.from('rental_items').select('id,name,description,price,available,image_path,is_active').eq('is_active', true).order('name');
    if (error) { console.error(error); status.textContent = 'We could not load rental items. Please refresh and try again.'; return; }
    rentalItems.splice(0, rentalItems.length, ...(data || []));
    status.textContent = rentalItems.length ? '' : 'No rental items are currently available.';
    renderRentals();
  }
  function renderRentals() {
    const container = document.getElementById('rentals');
    const search = document.getElementById('rentalSearch').value.trim().toLowerCase();
    const filter = document.getElementById('rentalFilter').value;
    const visible = rentalItems.filter(item => {
      const name = item.name.toLowerCase();
      const searchable = `${name} ${item.description || ''}`.toLowerCase();
      const matchesSearch = searchable.includes(search);
      const matchesCategory = filter === 'all' || (filter === 'other' ? !/(table|chair|canopy|serving|kitchen)/.test(name) : name.includes(filter === 'serving' ? 'serv' : filter.slice(0, -1)) || (filter === 'canopies' && name.includes('canopy')));
      return matchesSearch && matchesCategory;
    });
    container.replaceChildren(...visible.map(item => {
      const available = Math.max(0, Number(item.available) || 0);
      const quantity = selectedRentals.get(item.id) || 0;
      const card = document.createElement('article'); card.className = 'rental-card';
      if (item.image_path) {
        const image = document.createElement('img'); image.src = client.storage.from('rental-items').getPublicUrl(item.image_path).data.publicUrl; image.alt = item.name; image.loading = 'lazy'; card.append(image);
      } else { const placeholder = document.createElement('div'); placeholder.className = 'rental-placeholder'; placeholder.innerHTML = '<i class="fa-solid fa-chair" aria-hidden="true"></i>'; card.append(placeholder); }
      const info = document.createElement('div'); info.className = 'rental-info';
      info.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || 'Rental item')}</p><div class="rental-meta"><strong>${money(item.price)}</strong><span>${available} available</span></div>`;
      if (!available) { const out = document.createElement('span'); out.className = 'out-stock'; out.textContent = 'OUT OF STOCK'; info.append(out); }
      else {
        const control = document.createElement('div'); control.className = 'quantity-control';
        const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = String.fromCharCode(0x2212); minus.setAttribute('aria-label', `Remove one ${item.name}`); minus.disabled = quantity === 0;
        const output = document.createElement('output'); output.textContent = String(quantity);
        const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', `Add one ${item.name}`); plus.disabled = quantity >= available;
        minus.addEventListener('click', () => setRentalQuantity(item, quantity - 1)); plus.addEventListener('click', () => setRentalQuantity(item, quantity + 1));
        control.append(minus, output, plus); info.append(control);
      }
      card.append(info); return card;
    }));
  }
  function setRentalQuantity(item, quantity) { if (quantity <= 0) selectedRentals.delete(item.id); else selectedRentals.set(item.id, Math.min(quantity, Number(item.available) || 0)); renderRentals(); }
  document.getElementById('rentalSearch').addEventListener('input', renderRentals);
  document.getElementById('rentalFilter').addEventListener('change', renderRentals);

  function calculateBill() {
    let total = 0;
    let incomplete = false;
    const rows = [];

    rentalItems.filter(item => selectedRentals.has(item.id)).forEach(item => {
      const quantity = selectedRentals.get(item.id);
      if (item.price == null) { incomplete = true; rows.push([`${item.name} Ã— ${quantity}`, 'Price to be confirmed']); return; }
      const lineTotal = Number(item.price) * quantity;
      total += lineTotal;
      rows.push([`${item.name} Ã— ${quantity}`, money(lineTotal)]);
    });
    return { rows, total, incomplete };
  }

  function renderSummary() {
    const bill = calculateBill();
    const dietary = [...form.querySelectorAll('[name="dietary"]:checked')].map(x => x.value);
    const selectedRentalSummary = rentalItems.filter(item => selectedRentals.has(item.id)).map(item => `${item.name} Ã— ${selectedRentals.get(item.id)} Â· ${money(item.price)} each`).join('\n') || 'None selected';
    const blocks = [
      ['Customer', `${value('customer_name')} Â· ${value('customer_email')} Â· ${value('customer_phone')}`, 0],
      ['Event & location', `${value('event_type')} Â· ${value('event_date')} Â· ${value('start_time') || 'Time TBD'}â€“${value('end_time') || 'TBD'} Â· ${value('guest_count')} guests\n${value('venue_name')} Â· ${value('district')}\n${value('event_address')}`, 1],
      ['Catering requirements', `Dietary: ${dietary.join(', ') || 'None'}\n${value('food_notes')}`, 2],
      ['Rental items', selectedRentalSummary, 3],
      ['Budget & additional information', `Estimated budget: ${value('estimated_budget') ? money(value('estimated_budget')) : 'Not specified'}\n${value('additional_requirements') || 'No additional information'}\n${collectCustomFieldAnswers()}`, 4]
    ];
    const summary = document.getElementById('summary');
    summary.replaceChildren();
    blocks.forEach(([title, content, step]) => {
      const section = document.createElement('section'); section.className = 'summary-block';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'summary-edit'; edit.textContent = 'Edit'; edit.addEventListener('click', () => showStep(step));
      const heading = document.createElement('h3'); heading.textContent = title;
      const details = document.createElement('p'); details.textContent = content;
      section.append(edit, heading, details); summary.append(section);
    });
    const billHost = document.getElementById('bookingBill');
    billHost.replaceChildren();
    billHost.append(Object.assign(document.createElement('h3'), { textContent: 'Estimated bill' }));
    const exclusionNote=document.createElement('p');exclusionNote.className='bill-note';exclusionNote.textContent='This estimate includes selected rental items only. Catering and food costs are excluded.';billHost.append(exclusionNote);
    bill.rows.forEach(([label, amount]) => {
      const row = document.createElement('div'); row.className = 'bill-row';
      const labelNode = document.createElement('span'); labelNode.textContent = label;
      const amountNode = document.createElement('strong'); amountNode.textContent = amount;
      row.append(labelNode, amountNode); billHost.append(row);
    });
    const totalRow = document.createElement('div'); totalRow.className = 'bill-total';
    totalRow.append(document.createElement('span'), document.createElement('strong'));
    totalRow.firstElementChild.textContent = bill.incomplete ? 'Estimated total for priced rental items' : 'Estimated rental total';
    totalRow.lastElementChild.textContent = money(bill.total);
    billHost.append(totalRow);
    if (bill.incomplete) {
      const note = document.createElement('p'); note.className = 'bill-note';
      note.textContent = 'Some selected prices have not been set by CS Catering yet. This estimate is incomplete; the final quotation may change.';
      billHost.append(note);
    }
  }

  async function submitBooking(event) {
    event.preventDefault(); clearMessage();
    if(isAdminPreview){message('This is a preview. Booking requests cannot be submitted from the admin preview.','success');return;}
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) { const invalid = steps.findIndex((_, i) => !validateStep(i)); showStep(Math.max(0, invalid)); return; }
    const currentBill = calculateBill();
    if (currentBill.incomplete) { message('Some selected prices are not available yet. Please contact CS Catering before submitting this request.'); showStep(5); return; }
    if (!document.getElementById('confirmAccurate').checked || !document.getElementById('confirmRequest').checked) { message('Please confirm both statements before submitting.'); return; }
    if (!client) { message('Booking services are currently unavailable. Please try again later.'); return; }
    const { data: { user } = {}, error: authError } = await client.auth.getUser();
    if (authError || !user) { message('Please sign in before submitting. Your booking will be linked to your account so you can track it.'); return; }
    for (const item of rentalItems) if ((selectedRentals.get(item.id) || 0) > Number(item.available)) { message(`${item.name} availability changed. Please adjust the selected quantity.`); showStep(3); return; }
    const submitButton = document.getElementById('submitBooking'); submitButton.disabled = true; submitButton.textContent = 'Submitting your bookingâ€¦';
    try {
      const bill = calculateBill();
      const booking = { user_id: user.id, customer_name: value('customer_name'), customer_email: value('customer_email'), customer_phone: value('customer_phone'), alternative_phone: value('alternative_phone') || null, preferred_contact_method: form.querySelector('[name="preferred_contact_method"]:checked')?.value || 'WhatsApp', event_type: value('event_type'), event_date: value('event_date'), start_time: value('start_time') || null, end_time: value('end_time') || null, guest_count: Number(value('guest_count')), venue_name: value('venue_name') || null, district: value('district'), event_address: value('event_address'), location_instructions: value('location_instructions') || null, estimated_budget: value('estimated_budget') ? Number(value('estimated_budget')) : null, estimated_total: bill.total, additional_requirements: [value('food_notes') ? `Food requirements: ${value('food_notes')}` : '', value('additional_requirements'), collectCustomFieldAnswers()].filter(Boolean).join('\n\n') || null };
      const { data: inserted, error } = await client.from('event_bookings').insert(booking).select('id,booking_reference,event_type,event_date,guest_count,status').single();
      if (error) throw error;
      const inserts = [];
      for (const item of rentalItems) { const quantity = selectedRentals.get(item.id); if (quantity) inserts.push(client.from('booking_rental_items').insert({ booking_id: inserted.id, rental_item_id: item.id, quantity, unit_price: Number(item.price) || 0 })); }
      for (const requirement of [...form.querySelectorAll('[name="dietary"]:checked')]) inserts.push(client.from('booking_dietary_requirements').insert({ booking_id: inserted.id, requirement: requirement.value }));
      const results = await Promise.all(inserts); const childFailure = results.find(result => result.error); if (childFailure) throw childFailure.error;
      sessionStorage.setItem('csLastBooking', JSON.stringify({ ...inserted, venue_name: booking.venue_name }));
      window.location.assign(`pages/confirmation.html?booking=${encodeURIComponent(inserted.id)}`);
    } catch (error) {
      console.error('Booking submission failed:', { message: error?.message, code: error?.code, details: error?.details, hint: error?.hint, error });
      message('We couldnâ€™t submit your booking right now. Please check your connection and try again. If this keeps happening, contact CS Catering.');
      submitButton.disabled = false; submitButton.textContent = 'Submit booking request';
    }
  }
  form.addEventListener('submit', submitBooking);
  if(isAdminPreview){const previewSubmit=document.getElementById('submitBooking');if(previewSubmit){previewSubmit.disabled=true;previewSubmit.textContent='Preview only â€” submission disabled';}}
  form.elements.event_date.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.elements.event_date.addEventListener('change', () => { form.elements.event_date.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  if (!client) message('Supabase could not be initialized. Reload the page or contact the site administrator.');
  if(isAdminPreview)showStep(0);
  Promise.allSettled([loadProfile().catch(error => console.warn('Profile lookup failed:', error)), loadRentals(), loadFormOptions(), loadFormLayouts()]).then(()=>{
    if(isAdminPreview&&window.parent!==window)window.parent.postMessage({type:'cs-customer-preview-ready'},location.origin);
  });
})();
