const supabaseClient = window.csSupabase;
const productGrid = document.getElementById('store-product-grid');
const storeStatus = document.getElementById('store-status');
const searchInput = document.getElementById('store-search');
const cartDialog = document.getElementById('cart-dialog');
const cartItems = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const cartTotal = document.getElementById('cart-total');
const checkoutButton = document.getElementById('checkout-button');
const currencyFormatter = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });
const cart = new Map();
let products = [];

function setStoreStatus(text, type = '') {
    storeStatus.textContent = text;
    storeStatus.className = `store-status ${type}`;
}

function imageUrl(path) {
    if (!path || !supabaseClient) return '';
    return supabaseClient.storage.from('store-products').getPublicUrl(path).data.publicUrl;
}

async function loadStoreProducts() {
    if (!supabaseClient) throw new Error('Supabase could not load. Refresh the page or check your connection.');
    const { data, error } = await supabaseClient
        .from('store_products')
        .select('id, name, description, price, available, image_path')
        .eq('is_active', true)
        .order('name', { ascending: true });
    if (error) throw error;
    products = data || [];
    renderProducts();
    setStoreStatus(products.length ? `${products.length} products available` : 'No products are available right now.');
}

function renderProducts() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const visibleProducts = products.filter(product => product.name.toLowerCase().includes(searchTerm));
    productGrid.replaceChildren();
    if (!visibleProducts.length) {
        const empty = document.createElement('p');
        empty.className = 'store-empty';
        empty.textContent = products.length ? 'No products match your search.' : 'Products will appear here when they are added.';
        productGrid.append(empty);
        return;
    }

    visibleProducts.forEach(product => {
        const card = document.createElement('article');
        card.className = 'store-product-card';
        const photo = document.createElement('img');
        photo.className = 'store-product-photo';
        photo.src = imageUrl(product.image_path);
        photo.alt = product.name;
        photo.loading = 'lazy';

        const copy = document.createElement('div');
        copy.className = 'store-product-copy';
        const name = document.createElement('h3');
        name.textContent = product.name;
        const description = document.createElement('p');
        description.className = 'store-product-description';
        description.textContent = product.description || 'Cleaning essential';
        const meta = document.createElement('div');
        meta.className = 'store-product-meta';
        const price = document.createElement('span');
        price.className = 'store-product-price';
        price.textContent = currencyFormatter.format(Number(product.price));
        const stock = document.createElement('span');
        stock.className = `store-stock ${product.available <= 0 ? 'out' : ''}`;
        stock.textContent = product.available > 0 ? `${product.available} in stock` : 'Out of stock';
        meta.append(price, stock);

        const addButton = document.createElement('button');
        addButton.className = 'add-to-basket';
        addButton.type = 'button';
        addButton.disabled = product.available <= 0;
        addButton.textContent = product.available > 0 ? 'Add to basket' : 'Out of stock';
        addButton.addEventListener('click', () => addToCart(product));
        copy.append(name, description, meta, addButton);
        card.append(photo, copy);
        productGrid.append(card);
    });
}

function addToCart(product) {
    const existing = cart.get(product.id);
    if ((existing?.quantity || 0) >= product.available) {
        setStoreStatus(`Only ${product.available} ${product.name} available.`);
        return;
    }
    cart.set(product.id, { product, quantity: (existing?.quantity || 0) + 1 });
    renderCart();
    setStoreStatus(`${product.name} added to your basket.`);
}

function changeQuantity(productId, delta) {
    const entry = cart.get(productId);
    if (!entry) return;
    const quantity = entry.quantity + delta;
    if (quantity <= 0) cart.delete(productId);
    else if (quantity <= entry.product.available) cart.set(productId, { ...entry, quantity });
    renderCart();
}

function renderCart() {
    cartItems.replaceChildren();
    const entries = [...cart.values()];
    const itemCount = entries.reduce((count, entry) => count + entry.quantity, 0);
    const total = entries.reduce((sum, entry) => sum + Number(entry.product.price) * entry.quantity, 0);
    cartCount.textContent = String(itemCount);
    cartTotal.textContent = currencyFormatter.format(total);
    checkoutButton.disabled = entries.length === 0;

    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'cart-empty';
        empty.textContent = 'Your basket is empty.';
        cartItems.append(empty);
        return;
    }

    entries.forEach(({ product, quantity }) => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        const details = document.createElement('div');
        const name = document.createElement('h3');
        name.textContent = product.name;
        const price = document.createElement('p');
        price.textContent = `${currencyFormatter.format(Number(product.price))} each`;
        details.append(name, price);
        const controls = document.createElement('div');
        controls.className = 'quantity-control';
        const decrease = document.createElement('button');
        decrease.type = 'button';
        decrease.textContent = '-';
        decrease.setAttribute('aria-label', `Remove one ${product.name}`);
        decrease.addEventListener('click', () => changeQuantity(product.id, -1));
        const quantityLabel = document.createElement('span');
        quantityLabel.textContent = String(quantity);
        const increase = document.createElement('button');
        increase.type = 'button';
        increase.textContent = '+';
        increase.disabled = quantity >= product.available;
        increase.setAttribute('aria-label', `Add one ${product.name}`);
        increase.addEventListener('click', () => changeQuantity(product.id, 1));
        controls.append(decrease, quantityLabel, increase);
        row.append(details, controls);
        cartItems.append(row);
    });
}

function sendWhatsAppOrder() {
    const entries = [...cart.values()];
    if (!entries.length) return;
    const lines = entries.map(({ product, quantity }) => `${product.name} x ${quantity} = ${currencyFormatter.format(Number(product.price) * quantity)}`);
    const total = entries.reduce((sum, entry) => sum + Number(entry.product.price) * entry.quantity, 0);
    const message = `Hello, I would like to order these cleaning products:\n\n${lines.join('\n')}\n\nSubtotal: ${currencyFormatter.format(total)}`;
    window.open(`https://wa.me/94772292073?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
}

document.getElementById('open-cart').addEventListener('click', () => cartDialog.showModal());
document.getElementById('close-cart').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', event => {
    if (event.target === cartDialog) cartDialog.close();
});
checkoutButton.addEventListener('click', sendWhatsAppOrder);
searchInput.addEventListener('input', renderProducts);

renderCart();
loadStoreProducts().catch(error => setStoreStatus(error.message || 'Could not load products from the store.', 'error'));
