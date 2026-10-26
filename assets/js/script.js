const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = window.csSupabaseConfig;

async function fetchInventory() {
    const container = document.getElementById('inventory-grid');
    if (!container) return;

    if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
        container.innerHTML = '<p class="error-msg">Connect Supabase by adding your project URL and publishable key in script.js.</p>';
        return;
    }

    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/rental_items?select=name,description,price,total,available,image_path,is_active&is_active=eq.true&order=name.asc`,
            { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
        );
        if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
        const items = await response.json();

        if (!items.length) {
            container.innerHTML = '<p>No inventory items yet.</p>';
            return;
        }

        const cards = items.map(item => {
            const total = Number(item.total) || 0;
            const available = Number(item.available) || 0;
            const out = available <= 0;
            const card = document.createElement('article');
            card.className = 'menu-product-card';

            if (item.image_path && window.csSupabase) {
                const image = document.createElement('img');
                image.className = 'menu-product-image';
                image.src = window.csSupabase.storage.from('rental-items').getPublicUrl(item.image_path).data.publicUrl;
                image.alt = item.name;
                image.loading = 'lazy';
                card.append(image);
            } else {
                const imagePlaceholder = document.createElement('div');
                imagePlaceholder.className = 'menu-product-image menu-product-image-placeholder';
                imagePlaceholder.setAttribute('aria-hidden', 'true');
                card.append(imagePlaceholder);
            }

            const details = document.createElement('div');
            details.className = 'menu-product-details';
            const name = document.createElement('h3');
            name.className = 'menu-product-name';
            name.textContent = item.name;
            const description = document.createElement('p');
            description.className = 'menu-product-description';
            description.textContent = item.description || 'Rental item';
            const footer = document.createElement('div');
            footer.className = 'menu-product-footer';
            const price = document.createElement('strong');
            price.className = 'menu-product-price';
            price.textContent = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(Number(item.price) || 0);
            const stock = document.createElement('span');
            stock.className = `menu-product-stock ${out ? 'out' : ''}`;
            stock.textContent = `${available} available now / ${total} total`;
            footer.append(price, stock);
            details.append(name, description, footer);
            card.append(details);
            return card;
        });
        container.replaceChildren(...cards);
    } catch (error) {
        console.error('Could not load inventory from Supabase:', error);
        container.innerHTML = '<p class="error-msg">Failed to load inventory. Check your Supabase settings and table permissions.</p>';
    }
}

const inventoryContainer = document.getElementById('inventory-grid');
if (inventoryContainer) {
    fetchInventory();
    window.setInterval(() => {
        if (!document.hidden) fetchInventory();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchInventory();
    });
}

function filterTable() {
    const input = document.getElementById('menuSearch');
    const container = document.getElementById('inventory-grid');
    if (!input || !container) return;
    const filter = input.value.toLowerCase();
    container.querySelectorAll('.menu-product-card').forEach(card => {
        const name = card.querySelector('.menu-product-name')?.textContent || '';
        card.hidden = !name.toLowerCase().includes(filter);
    });
}

const contactForm = document.getElementById('catering-contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const name = document.getElementById('customer_name').value;
        const email = document.getElementById('customer_email').value;
        const phone = document.getElementById('customer_Phone_Number').value;
        const date = document.getElementById('event_date').value || 'Not specified';
        const guests = document.getElementById('guest_count').value || 'Not specified';
        const type = document.getElementById('event_type').value || 'General Inquiry';
        const message = document.getElementById('message').value;
        const waMessage = `*NEW CATERING INQUIRY*\n--------------------------\nName : ${name}\nEmail : ${email}\nPhone : ${phone}\nEvent Date : ${date}\nGuests : ${guests}\nType : ${type}\nDetails : ${message}`;
        window.open(`https://wa.me/94772292073?text=${encodeURIComponent(waMessage)}`, '_blank');
        const modal = document.getElementById('successModal');
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (modal && userNameDisplay) {
            userNameDisplay.innerText = name;
            modal.style.display = 'flex';
        }
        contactForm.reset();
    });
}

const quoteBtn = document.getElementById('quoteBtn');
if (quoteBtn) {
    quoteBtn.addEventListener('click', function() {
        if (confirm('Would you like to speak with our Event Consultant for a personalized quote?')) {
            window.location.href = 'tel:+94772292073';
        }
    });
}
