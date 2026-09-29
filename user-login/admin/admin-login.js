const supabaseClient = window.csSupabase;
const loginForm = document.getElementById('admin-login-form');
const loginButton = document.getElementById('login-button');
const loginStatus = document.getElementById('admin-login-status');

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
} else {
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

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) setLoginStatus(error.message, 'error');
        else continueIfAdmin(data.session);
    });
}
