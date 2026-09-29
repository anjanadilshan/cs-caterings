const supabaseClient = window.csSupabase;
const loginForm = document.getElementById('admin-login-form');
const registerForm = document.getElementById('admin-register-form');
const loginButton = document.getElementById('login-button');
const registerButton = document.getElementById('register-button');
const loginStatus = document.getElementById('admin-login-status');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const approvalNote = document.getElementById('approval-note');

function setAuthMode(mode) {
    const registering = mode === 'register';
    loginForm.classList.toggle('hidden', registering);
    registerForm.classList.toggle('hidden', !registering);
    approvalNote.classList.toggle('hidden', !registering);
    loginTab.classList.toggle('active', !registering);
    registerTab.classList.toggle('active', registering);
    loginTab.setAttribute('aria-selected', String(!registering));
    registerTab.setAttribute('aria-selected', String(registering));
    document.getElementById('auth-title').textContent = registering ? 'Admin Register' : 'Admin Login';
    document.getElementById('auth-description').textContent = registering
        ? 'Create an account and request administrator approval.'
        : 'Sign in with an approved administrator account.';
    setLoginStatus('');
}

function setLoginStatus(text, type = '') {
    loginStatus.textContent = text;
    loginStatus.className = `admin-status ${type}`;
}

async function continueIfAdmin(session) {
    if (!session?.user) return;
    setLoginStatus('Verifying administrator access...');
    const { data: isAdmin, error } = await supabaseClient.rpc('is_admin');
    if (error) {
        await supabaseClient.auth.signOut();
        setLoginStatus(`Could not verify administrator access: ${error.message}`, 'error');
        return;
    }
    if (isAdmin) {
        window.location.replace('admin.html');
        return;
    }
    await supabaseClient.auth.signOut();
    setLoginStatus('This account is registered but has not been approved as an administrator.', 'error');
}

if (!supabaseClient) {
    setLoginStatus('Supabase did not load. Check your connection and project settings.', 'error');
    loginButton.disabled = true;
    registerButton.disabled = true;
} else {
    loginTab.addEventListener('click', () => setAuthMode('login'));
    registerTab.addEventListener('click', () => setAuthMode('register'));

    if (new URLSearchParams(window.location.search).get('access') === 'denied') {
        setLoginStatus('This account does not have administrator access.', 'error');
    }

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        loginButton.disabled = true;
        setLoginStatus('Signing in...');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: document.getElementById('admin-email').value.trim(),
                password: document.getElementById('admin-password').value
            });
            if (error) throw error;
            await continueIfAdmin(data.session);
        } catch (error) {
            setLoginStatus(error.message || 'Unable to sign in.', 'error');
        } finally {
            loginButton.disabled = false;
        }
    });

    registerForm.addEventListener('submit', async event => {
        event.preventDefault();
        registerButton.disabled = true;
        setLoginStatus('Creating account...');
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
            setLoginStatus('Account registered. Confirm your email if requested, then ask an existing administrator to approve your access.', 'success');
        } catch (error) {
            setLoginStatus(error.message || 'Unable to register this account.', 'error');
        } finally {
            registerButton.disabled = false;
        }
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) setLoginStatus(error.message, 'error');
        else continueIfAdmin(data.session);
    });
}
