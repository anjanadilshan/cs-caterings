const supabaseClient = window.csSupabase;
const registerForm = document.getElementById('admin-register-form');
const registerButton = document.getElementById('register-button');
const registerStatus = document.getElementById('admin-register-status');

function setRegisterStatus(text, type = '') {
    registerStatus.textContent = text;
    registerStatus.className = `admin-status ${type}`;
}

if (!supabaseClient) {
    setRegisterStatus('Supabase did not load. Check your connection and project settings.', 'error');
    registerButton.disabled = true;
} else {
    registerForm.addEventListener('submit', async event => {
        event.preventDefault();
        registerButton.disabled = true;
        setRegisterStatus('Creating account...');
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email: document.getElementById('admin-register-email').value.trim(),
                password: document.getElementById('admin-register-password').value,
                options: {
                    data: {
                        full_name: document.getElementById('admin-name').value.trim()
                    }
                }
            });
            if (error) throw error;
            if (data.session) await supabaseClient.auth.signOut();
            registerForm.reset();
            setRegisterStatus('Account registered. Confirm your email if requested, then ask an existing administrator to approve your access.', 'success');
        } catch (error) {
            setRegisterStatus(error.message || 'Unable to register this account.', 'error');
        } finally {
            registerButton.disabled = false;
        }
    });
}
