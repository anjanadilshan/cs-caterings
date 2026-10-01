const supabaseClient = window.csSupabase;
const accessStatus = document.getElementById('admin-access-status');
const dashboard = document.getElementById('admin-dashboard');
const accountLabel = document.getElementById('admin-account');
const productForm = document.getElementById('product-form');
const productList = document.getElementById('admin-product-list');
const formStatus = document.getElementById('form-status');
const imageInput = document.getElementById('product-image');
const imagePreview = document.getElementById('image-preview');
const saveButton = document.getElementById('save-product');
const cancelEditButton = document.getElementById('cancel-edit');
const formHeading = document.getElementById('form-heading');
const productCount = document.getElementById('product-count');
const rentalTab = document.getElementById('rental-tab');
const cleaningTab = document.getElementById('cleaning-tab');
const usersTab = document.getElementById('users-tab');
const deliveryTab = document.getElementById('delivery-tab');
const eventsTab = document.getElementById('events-tab');
const deliveryPanel = document.getElementById('delivery-panel');
const catalogPanel = document.getElementById('catalog-panel');
const usersPanel = document.getElementById('users-panel');
const eventsPanel = document.getElementById('events-panel');
const userList = document.getElementById('admin-user-list');
const userCount = document.getElementById('user-count');
const userStatus = document.getElementById('user-status');
const priceField = document.getElementById('price-field');
const priceInput = document.getElementById('product-price');
let products = [];
let users = [];
let eventBookings = [];
let eventView = 'pending';
let editingProduct = null;
let previewUrl = '';
let catalogMode = 'rental';
let currentAdminId = '';

function catalogTable() {
    return catalogMode === 'cleaning' ? 'store_products' : 'rental_items';
}

function imageBucket() {
    return catalogMode === 'cleaning' ? 'store-products' : 'rental-items';
}

function itemLabel() {
    return catalogMode === 'cleaning' ? 'cleaning product' : 'rental item';
}

function setStatus(element, text, type = '') {
    element.textContent = text;
    element.className = `admin-status ${type}`;
}

function resetProductForm() {
    productForm.reset();
    document.getElementById('product-active').checked = true;
    editingProduct = null;
    imageInput.required = false;
    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    formHeading.textContent = `Add a ${itemLabel()}`;
    document.getElementById('total-stock-field').classList.toggle('hidden', catalogMode === 'cleaning');
    document.getElementById('available-stock-field').classList.toggle('hidden', catalogMode === 'cleaning');
    document.getElementById('cleaning-stock-count-field').classList.toggle('hidden', catalogMode !== 'cleaning');
    productForm.elements.cleaningStockCount.required = catalogMode === 'cleaning';
    productForm.elements.total.required = catalogMode !== 'cleaning';
    productForm.elements.available.required = catalogMode !== 'cleaning';
    saveButton.textContent = `Add ${itemLabel()}`;
    cancelEditButton.classList.add('hidden');
    setStatus(formStatus, '');
}

function showImagePreview(file) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
        previewUrl = '';
        imagePreview.classList.add('hidden');
        imagePreview.removeAttribute('src');
        return;
    }
    previewUrl = URL.createObjectURL(file);
    imagePreview.src = previewUrl;
    imagePreview.classList.remove('hidden');
}

function publicImageUrl(path) {
    if (!path) return '';
    return supabaseClient.storage.from(imageBucket()).getPublicUrl(path).data.publicUrl;
}

async function uploadImage(file) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('The image must be 5 MB or smaller.');
    const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await supabaseClient.storage.from(imageBucket()).upload(path, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) throw error;
    return path;
}

async function loadProducts() {
    productList.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'admin-empty';
    loading.textContent = 'Loading products...';
    productList.append(loading);

    const { data, error } = await supabaseClient
        .from(catalogTable())
        .select('id, name, description, price, total, available, image_path, is_active, created_at')
        .order('created_at', { ascending: false });
    if (error) throw error;
    products = data || [];
    productCount.textContent = String(products.length);
    renderProducts();
}

function renderProducts() {
    productList.replaceChildren();
    if (!products.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = 'No products yet. Add your first product using the form.';
        productList.append(empty);
        return;
    }

    products.forEach(product => {
        const row = document.createElement('article');
        row.className = 'admin-product-row';
        const image = document.createElement('img');
        image.className = 'admin-product-image';
        image.src = publicImageUrl(product.image_path);
        image.alt = '';
        const info = document.createElement('div');
        info.className = 'admin-product-info';
        const name = document.createElement('h3');
        name.textContent = product.name;
        const stock = document.createElement('p');
        stock.textContent = catalogMode === 'cleaning'
            ? `${product.available > 0 ? `${product.available} in stock` : 'Out of stock'} Â· ${product.is_active ? 'Visible' : 'Hidden'}`
            : `${product.available} available of ${product.total} Â· ${product.is_active ? 'Visible' : 'Hidden'}`;
        info.append(name, stock);
        const price = document.createElement('p');
        price.className = 'admin-product-price';
        price.textContent = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(product.price));
        info.append(price);

        const actions = document.createElement('div');
        actions.className = 'admin-product-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'edit-product';
        edit.setAttribute('aria-label', `Edit ${product.name}`);
        edit.title = 'Edit product';
        edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
        edit.addEventListener('click', () => startEditing(product));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'delete-product';
        remove.setAttribute('aria-label', `Delete ${product.name}`);
        remove.title = 'Delete product';
        remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
        remove.addEventListener('click', () => deleteProduct(product));
        actions.append(edit);
        if (catalogMode === 'cleaning') {
            const stockCount = document.createElement('input');
            stockCount.type = 'number';
            stockCount.min = '0';
            stockCount.step = '1';
            stockCount.value = String(product.total);
            stockCount.className = 'stock-quantity-input';
            stockCount.setAttribute('aria-label', `In-stock quantity for ${product.name}`);
            stockCount.title = 'In-stock quantity';
            stockCount.addEventListener('change', () => updateCleaningQuantity(product, stockCount));
            actions.append(stockCount);

            const stockToggle = document.createElement('button');
            stockToggle.type = 'button';
            stockToggle.className = 'toggle-stock';
            stockToggle.textContent = product.available > 0 ? 'Mark out of stock' : 'Mark in stock';
            stockToggle.setAttribute('aria-label', `${product.available > 0 ? 'Mark out of stock' : 'Mark in stock'}: ${product.name}`);
            stockToggle.addEventListener('click', () => toggleCleaningStock(product));
            actions.append(stockToggle);
        }
        actions.append(remove);
        row.append(image, info, actions);
        productList.append(row);
    });
}

function startEditing(product) {
    editingProduct = product;
    productForm.elements.name.value = product.name;
    productForm.elements.description.value = product.description || '';
    priceInput.value = product.price;
    if (catalogMode !== 'cleaning') {
        productForm.elements.total.value = product.total;
        productForm.elements.available.value = product.available;
    } else {
        productForm.elements.cleaningStockCount.value = product.total;
    }
    productForm.elements.active.checked = product.is_active;
    imageInput.value = '';
    imagePreview.src = publicImageUrl(product.image_path);
    imagePreview.classList.toggle('hidden', !product.image_path);
    formHeading.textContent = 'Edit product';
    saveButton.textContent = 'Save changes';
    cancelEditButton.classList.remove('hidden');
    setStatus(formStatus, '');
    document.querySelector('.product-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleProductSubmit(event) {
    event.preventDefault();
    const formData = new FormData(productForm);
    const name = String(formData.get('name')).trim();
    const description = String(formData.get('description')).trim();
    const price = Number(formData.get('price'));
    const cleaningStockCount = Number(formData.get('cleaningStockCount'));
    const total = catalogMode === 'cleaning' ? cleaningStockCount : Number(formData.get('total'));
    const available = catalogMode === 'cleaning'
        ? (editingProduct && Number(editingProduct.available) === 0 ? 0 : cleaningStockCount)
        : Number(formData.get('available'));
    const file = imageInput.files[0];

    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(total) || total < 0 || available < 0 || available > total) {
        setStatus(formStatus, 'Check the price and stock values. Available stock cannot exceed total stock.', 'error');
        return;
    }
    if (!editingProduct && !file) {
        setStatus(formStatus, 'Choose a product photo before adding this item.', 'error');
        return;
    }

    saveButton.disabled = true;
    setStatus(formStatus, editingProduct ? 'Saving changes...' : 'Adding product...');
    let newImagePath = '';
    try {
        if (file) newImagePath = await uploadImage(file);
        const values = {
            name,
            description,
            price,
            total,
            available,
            is_active: document.getElementById('product-active').checked
        };
        if (newImagePath) values.image_path = newImagePath;

        let result;
        if (editingProduct) {
            result = await supabaseClient.from(catalogTable()).update(values).eq('id', editingProduct.id);
        } else {
            result = await supabaseClient.from(catalogTable()).insert(values);
        }
        if (result.error) throw result.error;
        if (newImagePath && editingProduct?.image_path) {
            await supabaseClient.storage.from(imageBucket()).remove([editingProduct.image_path]);
        }
        resetProductForm();
        setStatus(formStatus, 'Product saved.', 'success');
        await loadProducts();
    } catch (error) {
        if (newImagePath) await supabaseClient.storage.from(imageBucket()).remove([newImagePath]);
        setStatus(formStatus, error.message || 'Could not save the product.', 'error');
    } finally {
        saveButton.disabled = false;
    }
}

async function deleteProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
        const { error } = await supabaseClient.from(catalogTable()).delete().eq('id', product.id);
        if (error) throw error;
        if (product.image_path) await supabaseClient.storage.from(imageBucket()).remove([product.image_path]);
        await loadProducts();
    } catch (error) {
        window.alert(error.message || 'Could not delete this product.');
    }
}

function setCatalogMode(mode) {
    catalogMode = mode;
    const cleaning = mode === 'cleaning';
    rentalTab.classList.toggle('active', !cleaning);
    cleaningTab.classList.toggle('active', cleaning);
    usersTab.classList.remove('active');
    deliveryTab.classList.remove('active');
    eventsTab.classList.remove('active');
    rentalTab.setAttribute('aria-selected', String(!cleaning));
    cleaningTab.setAttribute('aria-selected', String(cleaning));
    usersTab.setAttribute('aria-selected', 'false');
    deliveryTab.setAttribute('aria-selected', 'false');
    eventsTab.setAttribute('aria-selected', 'false');
    catalogPanel.classList.remove('hidden');
    usersPanel.classList.add('hidden');
    deliveryPanel.classList.add('hidden');
    eventsPanel.classList.add('hidden');
    priceField.classList.remove('hidden');
    priceInput.required = true;
    document.getElementById('catalog-eyebrow').textContent = cleaning ? 'CLEANING PRODUCT STORE' : 'RENTAL INVENTORY';
    document.getElementById('list-heading').textContent = cleaning ? 'Cleaning products' : 'Rental items';
    document.getElementById('active-label').textContent = cleaning ? 'Show in cleaning store' : 'Show on rental list';
    document.getElementById('image-hint').textContent = `Choose an image up to 5 MB. A photo is required for new ${itemLabel()}s.`;
    resetProductForm();
    loadProducts().catch(error => setStatus(formStatus, error.message || 'Could not load the catalog.', 'error'));
}

async function loadUsers() {
    userList.replaceChildren();
    setStatus(userStatus, 'Loading users...');
    const { data, error } = await supabaseClient.rpc('admin_list_users');
    if (error) throw error;
    users = data || [];
    userCount.textContent = String(users.length);
    renderUsers();
    setStatus(userStatus, `${users.length} registered users`);
}

function renderUsers() {
    userList.replaceChildren();
    if (!users.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = 'No registered users found.';
        userList.append(empty);
        return;
    }

    users.forEach(user => {
        const row = document.createElement('article');
        row.className = 'admin-user-row';
        const details = document.createElement('div');
        details.className = 'admin-product-info';
        const name = document.createElement('h3');
        name.textContent = user.full_name || user.email || 'Unnamed account';
        const email = document.createElement('p');
        email.textContent = user.email || 'No email address';
        const phone = document.createElement('p');
        phone.textContent = `Contact: ${user.phone_number || 'No contact number'}`;
        const joined = document.createElement('p');
        joined.textContent = `Joined ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(user.created_at))}`;
        const role = document.createElement('span');
        role.className = `user-role ${user.is_admin ? 'admin-role' : ''}`;
        role.textContent = user.is_admin ? 'Administrator' : 'User';
        details.append(name, email, phone, joined, role);

        const actions = document.createElement('div');
        actions.className = 'admin-user-actions';
        if (user.user_id !== currentAdminId) {
            const roleButton = document.createElement('button');
            roleButton.type = 'button';
            roleButton.className = 'admin-secondary';
            roleButton.textContent = user.is_admin ? 'Remove admin access' : 'Approve as admin';
            roleButton.addEventListener('click', () => updateAdminAccess(user));
            actions.append(roleButton);

            if (!user.is_admin) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'delete-user';
                deleteButton.textContent = 'Delete user';
                deleteButton.addEventListener('click', () => deleteUser(user));
                actions.append(deleteButton);
            }
        }

        row.append(details, actions);
        userList.append(row);
    });
}

async function updateAdminAccess(user) {
    const action = user.is_admin ? 'remove administrator access from' : 'approve';
    if (!window.confirm(`Are you sure you want to ${action} ${user.email}?`)) return;
    try {
        const { error } = await supabaseClient.rpc('admin_set_user_admin', {
            p_user_id: user.user_id,
            p_make_admin: !user.is_admin
        });
        if (error) throw error;
        await loadUsers();
    } catch (error) {
        setStatus(userStatus, error.message || 'Could not update administrator access.', 'error');
    }
}

async function deleteUser(user) {
    if (!window.confirm(`Permanently delete ${user.email}? Their sign-in and profile will be removed.`)) return;
    try {
        const { error } = await supabaseClient.rpc('admin_delete_user', { p_user_id: user.user_id });
        if (error) throw error;
        await loadUsers();
    } catch (error) {
        setStatus(userStatus, error.message || 'Could not delete this user.', 'error');
    }
}

function showUsers() {
    rentalTab.classList.remove('active');
    cleaningTab.classList.remove('active');
    usersTab.classList.add('active');
    deliveryTab.classList.remove('active');
    eventsTab.classList.remove('active');
    rentalTab.setAttribute('aria-selected', 'false');
    cleaningTab.setAttribute('aria-selected', 'false');
    usersTab.setAttribute('aria-selected', 'true');
    deliveryTab.setAttribute('aria-selected', 'false');
    eventsTab.setAttribute('aria-selected', 'false');
    catalogPanel.classList.add('hidden');
    usersPanel.classList.remove('hidden');
    deliveryPanel.classList.add('hidden');
    eventsPanel.classList.add('hidden');
    loadUsers().catch(error => setStatus(userStatus, error.message || 'Could not load users.', 'error'));
}

function formatEventDate(date) {
    if (!date) return 'Not provided';
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(parsed);
}

function addEventDetail(container, heading, lines) {
    const section = document.createElement('section');
    section.className = 'event-detail-section';
    const title = document.createElement('h4');
    title.textContent = heading;
    section.append(title);
    const list = document.createElement('dl');
    lines.forEach(([label, content]) => {
        const row = document.createElement('div');
        row.className = 'event-detail-row';
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = content || '\u2014';
        row.append(term, description);
        list.append(row);
    });
    section.append(list);
    container.append(section);
}

function renderRequestedEvents() {
    const host = document.getElementById('admin-event-list');
    host.replaceChildren();
    const pendingStatuses = new Set(['pending', 'under_review', 'quoted']);
    const approvedStatuses = new Set(['confirmed', 'in_progress', 'completed']);
    const pending = eventBookings.filter(booking => pendingStatuses.has(booking.status));
    const approved = eventBookings.filter(booking => approvedStatuses.has(booking.status));
    document.getElementById('event-count').textContent = String(pending.length + approved.length);
    document.getElementById('pending-event-count').textContent = String(pending.length);
    document.getElementById('approved-event-count').textContent = String(approved.length);
    const bookings = (eventView === 'pending' ? pending : approved).sort((a, b) => {
        if (eventView === 'pending') {
            return new Date(a.created_at) - new Date(b.created_at);
        }
        return String(a.event_date).localeCompare(String(b.event_date))
            || new Date(a.created_at) - new Date(b.created_at);
    });
    document.getElementById('events-total').textContent = String(bookings.length);
    if (!bookings.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = eventView === 'pending'
            ? 'There are no pending event requests.'
            : 'There are no approved events yet.';
        host.append(empty);
        return;
    }

    bookings.forEach(booking => {
        const card = document.createElement('article');
        card.className = 'admin-event-card';
        const header = document.createElement('div');
        header.className = 'admin-event-header';
        const headingWrap = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = `${booking.event_type} \u00B7 ${booking.booking_reference || "Booking request"}`;
        const meta = document.createElement('p');
        meta.className = 'event-meta';
        meta.textContent = `${formatEventDate(booking.event_date)} \u00B7 ${booking.guest_count} guests`;
        headingWrap.append(title, meta);
        const badge = document.createElement('span');
        badge.className = `event-status-badge status-${booking.status}`;
        badge.textContent = String(booking.status || 'pending').replaceAll('_', ' ');
        header.append(headingWrap, badge);
        card.append(header);
        const detailGrid = document.createElement('div');
        detailGrid.className = 'event-details-grid';
        card.append(detailGrid);

        addEventDetail(detailGrid, 'Customer', [
            ['Name', booking.customer_name], ['Email', booking.customer_email],
            ['Phone', booking.customer_phone], ['Alternative phone', booking.alternative_phone],
            ['Preferred contact', booking.preferred_contact_method]
        ]);
        addEventDetail(detailGrid, 'Event', [
            ['Type', booking.event_type], ['Date', formatEventDate(booking.event_date)],
            ["Time", [booking.start_time, booking.end_time].filter(Boolean).join(" \u2013 ") || "Not specified"],
            ['Guests', String(booking.guest_count)], ['Venue', booking.venue_name]
        ]);
        addEventDetail(detailGrid, 'Location', [
            ['District', booking.district], ['Address', booking.event_address],
            ['Instructions', booking.location_instructions]
        ]);
        addEventDetail(detailGrid, 'Catering requirements', [
            ['Dietary requirements', (booking.booking_dietary_requirements || []).map(item => item.requirement).join(', ') || 'None provided']
        ]);

        const rentalLines = (booking.booking_rental_items || []).map(item => {
            const rental = Array.isArray(item.rental_items) ? item.rental_items[0] : item.rental_items;
            return `${rental?.name || `Rental item #${item.rental_item_id}`} \u00D7 ${item.quantity} \u00B7 LKR ${Number(item.unit_price).toLocaleString("en-LK")} each`;
        });
        addEventDetail(detailGrid, 'Rental items', [['Selected rentals', rentalLines.join('\n') || 'None selected']]);
        addEventDetail(detailGrid, 'Budget & notes', [
            ['Estimated budget', booking.estimated_budget == null ? 'Not provided' : `LKR ${Number(booking.estimated_budget).toLocaleString('en-LK')}`],
            ['Estimated non-catering total', booking.estimated_total == null ? 'Not available' : `LKR ${Number(booking.estimated_total).toLocaleString('en-LK')}`],
            ['Additional requirements', booking.additional_requirements],
            ["Submitted", booking.created_at ? new Date(booking.created_at).toLocaleString() : "\u2014"]
        ]);

        const actions = document.createElement('div');
        actions.className = 'admin-event-actions';
        if (booking.status === 'pending' || booking.status === 'under_review' || booking.status === 'quoted') {
            const approve = document.createElement('button');
            approve.type = 'button';
            approve.className = 'admin-primary';
            approve.textContent = 'Approve & confirm booking';
            approve.addEventListener('click', () => approveEventBooking(booking, approve));
            actions.append(approve);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'delete-user';
        remove.textContent = 'Delete booking';
        remove.addEventListener('click', () => deleteEventBooking(booking, remove));
        actions.append(remove);
        card.append(actions);
        host.append(card);
    });
}

async function loadRequestedEvents() {
    const status = document.getElementById('events-status');
    const host = document.getElementById('admin-event-list');
    host.replaceChildren();
    setStatus(status, 'Loading requested events...');
    const { data, error } = await supabaseClient
        .from('event_bookings')
        .select('id,booking_reference,user_id,customer_name,customer_email,customer_phone,alternative_phone,preferred_contact_method,event_type,event_date,start_time,end_time,guest_count,venue_name,district,event_address,location_instructions,estimated_budget,estimated_total,additional_requirements,status,created_at,updated_at,booking_rental_items(rental_item_id,quantity,unit_price,rental_items(name)),booking_dietary_requirements(requirement)')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Could not load requested events:', error);
        setStatus(status, 'Could not load booking requests. Check the event booking tables and admin RLS policies.', 'error');
        return;
    }
    eventBookings = data || [];
    renderRequestedEvents();
    const pendingCount = eventBookings.filter(booking => ['pending', 'under_review', 'quoted'].includes(booking.status)).length;
    const approvedCount = eventBookings.filter(booking => ['confirmed', 'in_progress', 'completed'].includes(booking.status)).length;
    setStatus(status, `${pendingCount} pending request${pendingCount === 1 ? "" : "s"} \u00B7 ${approvedCount} approved event${approvedCount === 1 ? "" : "s"}.`);
}

async function loadEventCounts() {
    const relevantStatuses = ['pending', 'under_review', 'quoted', 'confirmed', 'in_progress', 'completed'];
    const { count, error } = await supabaseClient
        .from('event_bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', relevantStatuses);
    if (error) {
        console.warn('Could not load event count:', error);
        return;
    }
    document.getElementById('event-count').textContent = String(count || 0);
}

async function approveEventBooking(booking, button) {
    if (!window.confirm(`Approve and confirm booking ${booking.booking_reference || ''} for ${booking.customer_name}?`)) return;
    button.disabled = true;
    button.textContent = 'Approving...';
    const status = document.getElementById('events-status');
    try {
        const { data, error } = await supabaseClient
            .from('event_bookings')
            .update({ status: 'confirmed' })
            .eq('id', booking.id)
            .in('status', ['pending', 'under_review', 'quoted'])
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('This booking was already updated. Refresh the list to see its current status.');
        setStatus(status, `${booking.booking_reference || 'Booking'} approved and confirmed.`, 'success');
        await loadRequestedEvents();
    } catch (error) {
        console.error('Could not approve booking:', error);
        setStatus(status, error.message || 'Could not approve this booking.', 'error');
        button.disabled = false;
        button.textContent = 'Approve & confirm booking';
    }
}

async function deleteEventBooking(booking, button) {
    const reference = booking.booking_reference || 'this booking';
    if (!window.confirm(`Permanently delete ${reference} for ${booking.customer_name}? Its linked rental, service, dietary, quotation, and note records will also be deleted.`)) return;
    button.disabled = true;
    button.textContent = 'Deleting...';
    const status = document.getElementById('events-status');
    try {
        const { data, error } = await supabaseClient
            .from('event_bookings')
            .delete()
            .eq('id', booking.id)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('The booking was not deleted. It may already have been removed or you may not have permission.');
        setStatus(status, `${reference} deleted.`, 'success');
        await loadRequestedEvents();
    } catch (error) {
        console.error('Could not delete event booking:', error);
        setStatus(status, error.message || 'Could not delete this booking.', 'error');
        button.disabled = false;
        button.textContent = 'Delete booking';
    }
}

function showRequestedEvents() {
    [rentalTab, cleaningTab, usersTab, deliveryTab, eventsTab].forEach(tab => {
        const active = tab === eventsTab;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    catalogPanel.classList.add('hidden');
    usersPanel.classList.add('hidden');
    deliveryPanel.classList.add('hidden');
    eventsPanel.classList.remove('hidden');
    loadRequestedEvents();
}

function setEventView(view) {
    eventView = view;
    const pendingButton = document.getElementById('pending-events-view');
    const approvedButton = document.getElementById('approved-events-view');
    pendingButton.classList.toggle('active', view === 'pending');
    approvedButton.classList.toggle('active', view === 'approved');
    pendingButton.setAttribute('aria-selected', String(view === 'pending'));
    approvedButton.setAttribute('aria-selected', String(view === 'approved'));
    renderRequestedEvents();
}

async function toggleCleaningStock(product) {
    const nextAvailable = product.available > 0 ? 0 : 1;
    const { error } = await supabaseClient.from('store_products').update({
        total: Math.max(Number(product.total) || 1, 1),
        available: nextAvailable
    }).eq('id', product.id);
    if (error) { setStatus(formStatus, error.message || 'Could not update stock status.', 'error'); return; }
    await loadProducts();
}

async function updateCleaningQuantity(product, input) {
    const quantity = Number(input.value);
    if (!Number.isInteger(quantity) || quantity < 0) {
        input.value = String(product.total);
        setStatus(formStatus, 'Enter a whole quantity of zero or more.', 'error');
        return;
    }
    input.disabled = true;
    const { error } = await supabaseClient.from('store_products').update({
        total: quantity,
        available: product.available > 0 ? quantity : 0
    }).eq('id', product.id);
    input.disabled = false;
    if (error) {
        input.value = String(product.total);
        setStatus(formStatus, error.message || 'Could not update the in-stock quantity.', 'error');
        return;
    }
    await loadProducts();
    setStatus(formStatus, `${product.name} stock quantity updated.`, 'success');
}

async function showDeliveryAreas() {
    [rentalTab, cleaningTab, usersTab, eventsTab].forEach(tab => { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); });
    deliveryTab.classList.add('active'); deliveryTab.setAttribute('aria-selected', 'true');
    catalogPanel.classList.add('hidden'); usersPanel.classList.add('hidden'); eventsPanel.classList.add('hidden'); deliveryPanel.classList.remove('hidden');
    const status = document.getElementById('delivery-status');
    setStatus(status, 'Loading areas...');
    const { data, error } = await supabaseClient.from('delivery_areas').select('name, cash_on_delivery').order('name');
    if (error) { setStatus(status, error.message, 'error'); return; }
    document.getElementById('delivery-area-list').value = (data || []).map(area => `${area.name} | ${area.cash_on_delivery ? 'COD' : 'online'}`).join('\n');
    setStatus(status, `${(data || []).length} delivery locations`);
}

async function handleSession(session) {
    const user = session?.user;
    if (!user) {
        window.location.replace('admin-login.html');
        return;
    }

    setStatus(accessStatus, 'Checking administrator access...');
    const { data: isAdmin, error } = await supabaseClient.rpc('is_admin');
    if (error) {
        dashboard.classList.add('hidden');
        setStatus(accessStatus, `Could not verify admin access: ${error.message}`, 'error');
        return;
    }
    if (!isAdmin) {
        await supabaseClient.auth.signOut();
        window.location.replace('admin-login.html?access=denied');
        return;
    }

    accessStatus.classList.add('hidden');
    dashboard.classList.remove('hidden');
    currentAdminId = user.id;
    accountLabel.textContent = user.email || 'Administrator';
    await loadProducts();
    loadEventCounts();
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setStatus(accessStatus, error.message, 'error');
    else window.location.replace('admin-login.html');
}

if (!supabaseClient) {
    setStatus(accessStatus, 'Supabase did not load. Check the project settings and your internet connection.', 'error');
} else {
    resetProductForm();
    productForm.addEventListener('submit', handleProductSubmit);
    rentalTab.addEventListener('click', () => setCatalogMode('rental'));
    cleaningTab.addEventListener('click', () => setCatalogMode('cleaning'));
    usersTab.addEventListener('click', showUsers);
    deliveryTab.addEventListener('click', () => showDeliveryAreas().catch(error => setStatus(document.getElementById('delivery-status'), error.message, 'error')));
    eventsTab.addEventListener('click', showRequestedEvents);
    document.getElementById('pending-events-view').addEventListener('click', () => setEventView('pending'));
    document.getElementById('approved-events-view').addEventListener('click', () => setEventView('approved'));
    document.getElementById('refresh-events').addEventListener('click', () => loadRequestedEvents());
    document.getElementById('delivery-area-form').addEventListener('submit', async event => {
        event.preventDefault();
        const status = document.getElementById('delivery-status');
        const areas = document.getElementById('delivery-area-list').value.split(/\r?\n/).map(line => {
            const [name, mode = 'online'] = line.split('|');
            return { name: name.trim(), cash_on_delivery: mode.trim().toLowerCase() === 'cod', is_active: true };
        }).filter(area => area.name);
        const { error: clearError } = await supabaseClient.from('delivery_areas').delete().neq('name', '__none__');
        if (clearError) { setStatus(status, clearError.message, 'error'); return; }
        if (areas.length) { const { error } = await supabaseClient.from('delivery_areas').insert(areas); if (error) { setStatus(status, error.message, 'error'); return; } }
        setStatus(status, 'Delivery areas saved.', 'success');
    });
    imageInput.addEventListener('change', () => showImagePreview(imageInput.files[0]));
    cancelEditButton.addEventListener('click', resetProductForm);
    document.getElementById('refresh-products').addEventListener('click', () => loadProducts().catch(error => {
        setStatus(formStatus, error.message || 'Could not load products.', 'error');
    }));
    document.getElementById('refresh-users').addEventListener('click', () => loadUsers().catch(error => {
        setStatus(userStatus, error.message || 'Could not load users.', 'error');
    }));
    document.getElementById('dashboard-signout').addEventListener('click', signOut);

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) setStatus(accessStatus, error.message, 'error');
        else handleSession(data.session).catch(error => setStatus(accessStatus, error.message, 'error'));
    });
    supabaseClient.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') window.location.replace('admin-login.html');
    });
}
