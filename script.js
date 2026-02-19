const sheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRZl-eBozriU22GpYseBbjd7NnEfXZdSe1QDfFgT_mzICfMfUf-JQTuq6EOKygKNeHV9IiIAcHnd7JO/pub?output=csv';

async function fetchInventory() {
    const container = document.getElementById('inventory-grid');
    if (!container) return;

    try {
        const response = await fetch(`${sheetURL}&cachebust=${new Date().getTime()}`);
        const data = await response.text();
        const rows = data.split(/\r?\n/).slice(1); 
        
        // Table Header
        let tableHTML = `
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Availability</th>
                        <th>Stock Level</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(row => {
            const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (columns.length >= 3) {
                const name = columns[0].trim();
                const total = parseInt(columns[1]) || 0;
                const available = parseInt(columns[2]) || 0;
                const percentage = total > 0 ? (available / total) * 100 : 0;
                const isOutOfStock = available <= 0;

                if (!name) return;

                tableHTML += `
                    <tr class="${isOutOfStock ? 'row-out' : ''}">
                        <td class="item-name">${name}</td>
                        <td>${available} / ${total}</td>
                        <td>
                            <div class="table-progress-bg">
                                <div class="table-progress-fill" style="width: ${percentage}%"></div>
                            </div>
                        </td>
                        <td>
                            <span class="status-badge ${isOutOfStock ? 'badge-red' : 'badge-gold'}">
                                ${isOutOfStock ? '❌ Rent Out' : '✅ In Stock'}
                            </span>
                        </td>
                    </tr>
                `;
            }
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;

    } catch (error) {
        container.innerHTML = `<p class="error-msg">Failed to load live table. Please refresh.</p>`;
    }
}
fetchInventory();

function filterTable() {
    //search input and the table
    const input = document.getElementById("menuSearch");
    const filter = input.value.toLowerCase();
    const table = document.querySelector(".inventory-table");
    
    // Safety check in case table isn't loaded yet
    if (!table) return;

    const tr = table.getElementsByTagName("tr");

    // Loop through all table rows (starting from index 1 to skip the header)
    for (let i = 1; i < tr.length; i++) {
        const itemNameCell = tr[i].getElementsByClassName("item-name")[0];
        
        if (itemNameCell) {
            const txtValue = itemNameCell.textContent || itemNameCell.innerText;
            
            // If the item name matches the search, show it; otherwise, hide it
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}

// --- FORM HANDLING SECTION ---
const contactForm = document.getElementById('catering-contact-form');

if (contactForm) {
    contactForm.addEventListener('submit', function(event) {
        event.preventDefault();

        // 1. Capture the values using the IDs from your HTML
        const name = document.getElementById('customer_name').value;
        const email = document.getElementById('customer_email').value;
        const phone = document.getElementById('customer_Phone_Number').value; // New Field
        const date = document.getElementById('event_date').value || "Not specified";
        const guests = document.getElementById('guest_count').value || "Not specified";
        const type = document.getElementById('event_type').value || "General Inquiry";
        const message = document.getElementById('message').value;

        // 2. Format the WhatsApp Message
        // %0A creates a new line, *text* makes it bold
        const waMessage = `*NEW CATERING INQUIRY*%0A` + 
                          `--------------------------%0A` +
                          `Name :       ${name}%0A` +
                          `Email :      ${email}%0A` +
                          `Phone :      ${phone}%0A` +
                          `Event Date : ${date}%0A` +
                          `Guests :     ${guests}%0A` +
                          `Type :       ${type}%0A` +
                          `Details :    ${message}`;

        // 3. Owner's Phone Number (Sri Lankan format: 94 + number)
        const ownerNumber = "94772292073"; 

        // 4. Generate URL and Open WhatsApp
        const waURL = `https://wa.me/${ownerNumber}?text=${waMessage}`;
        
        // Open in new tab
        window.open(waURL, '_blank');

        // 5. Show your Success Modal
        const modal = document.getElementById('successModal');
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (modal) {
            userNameDisplay.innerText = name;
            modal.style.display = 'flex';
        }
        
        // Clear the form
        contactForm.reset();
    });
}

// --- Get a Quote Button (Phone Call) ---
const quoteBtn = document.getElementById('quoteBtn');
if (quoteBtn) {
    quoteBtn.addEventListener('click', function() {
        const userChoice = confirm("Would you like to speak with our Event Consultant for a personalized quote?");
        if (userChoice) {
            window.location.href = "tel:+94772292073";
        }
    });
}