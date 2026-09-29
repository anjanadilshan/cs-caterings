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
const catalogPanel = document.getElementById('catalog-panel');
const usersPanel = document.getElementById('users-panel');
const userList = document.getElementById('admin-user-list');
const userCount = document.getElementById('user-count');
const userStatus = document.getElementById('user-status');
const priceField = document.getElementById('price-field');
const priceInput = document.getElementById('product-price');
let products = [];
let users = [];
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
        stock.textContent = `${product.available} available of ${product.total} · ${product.is_active ? 'Visible' : 'Hidden'}`;
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
        actions.append(edit, remove);
        row.append(image, info, actions);
        productList.append(row);
    });
}

function startEditing(product) {
    editingProduct = product;
    productForm.elements.name.value = product.name;
    productForm.elements.description.value = product.description || '';
    priceInput.value = product.price;
    productForm.elements.total.value = product.total;
    productForm.elements.available.value = product.available;
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
    const total = Number(formData.get('total'));
    const available = Number(formData.get('available'));
    const file = imageInput.files[0];

    if (!Number.isFinite(price) || price < 0 || total < 0 || available < 0 || available > total) {
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
    rentalTab.setAttribute('aria-selected', String(!cleaning));
    cleaningTab.setAttribute('aria-selected', String(cleaning));
    usersTab.setAttribute('aria-selected', 'false');
    catalogPanel.classList.remove('hidden');
    usersPanel.classList.add('hidden');
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
    rentalTab.setAttribute('aria-selected', 'false');
    cleaningTab.setAttribute('aria-selected', 'false');
    usersTab.setAttribute('aria-selected', 'true');
    catalogPanel.classList.add('hidden');
    usersPanel.classList.remove('hidden');
    loadUsers().catch(error => setStatus(userStatus, error.message || 'Could not load users.', 'error'));
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
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setStatus(accessStatus, error.message, 'error');
    else window.location.replace('admin-login.html');
}

if (!supabaseClient) {
    setStatus(accessStatus, 'Supabase did not load. Check the project settings and your internet connection.', 'error');
} else {
    productForm.addEventListener('submit', handleProductSubmit);
    rentalTab.addEventListener('click', () => setCatalogMode('rental'));
    cleaningTab.addEventListener('click', () => setCatalogMode('cleaning'));
    usersTab.addEventListener('click', showUsers);
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
