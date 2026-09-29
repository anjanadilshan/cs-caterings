const SUPABASE_URL = window.csSupabaseConfig?.url;
const SUPABASE_PUBLISHABLE_KEY = window.csSupabaseConfig?.key;

const form = document.getElementById('account-form');
const nameInput = document.getElementById('full-name');
const nameLabel = document.getElementById('name-label');
const phoneInput = document.getElementById('phone-number');
const phoneLabel = document.getElementById('phone-label');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submit-button');
const message = document.getElementById('message');
const signedInPanel = document.getElementById('signed-in-panel');
const signedInEmail = document.getElementById('signed-in-email');
const signInTab = document.getElementById('signin-tab');
const signUpTab = document.getElementById('signup-tab');

let mode = 'signin';
let supabaseClient = null;

function showMessage(text, type = '') {
    message.textContent = text;
    message.className = `message ${type}`;
}

function setMode(nextMode) {
    mode = nextMode;
    const creating = mode === 'signup';
    nameInput.classList.toggle('hidden', !creating);
    nameLabel.classList.toggle('hidden', !creating);
    nameInput.required = creating;
    phoneInput.classList.toggle('hidden', !creating);
    phoneLabel.classList.toggle('hidden', !creating);
    phoneInput.required = creating;
    passwordInput.autocomplete = creating ? 'new-password' : 'current-password';
    submitButton.textContent = creating ? 'Create account' : 'Sign in';
    signInTab.classList.toggle('active', !creating);
    signUpTab.classList.toggle('active', creating);
    signInTab.setAttribute('aria-selected', String(!creating));
    signUpTab.setAttribute('aria-selected', String(creating));
    showMessage('');
}

function showUser(user) {
    signedInPanel.classList.toggle('hidden', !user);
    form.classList.toggle('hidden', Boolean(user));
    document.querySelector('.tabs').classList.toggle('hidden', Boolean(user));
    signedInEmail.textContent = user?.email || '';
    if (user) showMessage('You are signed in.', 'success');
}

signInTab.addEventListener('click', () => setMode('signin'));
signUpTab.addEventListener('click', () => setMode('signup'));

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')) {
    showMessage('Add your Supabase project URL and publishable key in login.js to enable accounts.', 'error');
} else if (!window.supabase) {
    showMessage('Supabase client could not load. Check your internet connection.', 'error');
} else {
    supabaseClient = window.csSupabase;
    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) showMessage(error.message, 'error');
        showUser(data?.session?.user || null);
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => showUser(session?.user || null));
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!supabaseClient) return;
    submitButton.disabled = true;
    showMessage(mode === 'signup' ? 'Creating your account…' : 'Signing in…');

    try {
        const email = document.getElementById('email').value.trim();
        const password = passwordInput.value;
        let result;
        if (mode === 'signup') {
            result = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: nameInput.value.trim(),
                        phone_number: phoneInput.value.trim()
                    }
                }
            });
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }
        if (result.error) throw result.error;
        if (mode === 'signup' && !result.data.session) {
            showMessage('Account created. Check your email to confirm it, then sign in.', 'success');
            setMode('signin');
            showMessage('Account created. Check your email to confirm it, then sign in.', 'success');
        } else {
            showMessage(mode === 'signup' ? 'Account created and signed in.' : 'Signed in successfully.', 'success');
            showUser(result.data.user);
        }
    } catch (error) {
        showMessage(error.message || 'Unable to complete the request. Please try again.', 'error');
    } finally {
        submitButton.disabled = false;
    }
});

document.getElementById('signout-button').addEventListener('click', async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) showMessage(error.message, 'error');
    else {
        showUser(null);
        showMessage('You have signed out.', 'success');
    }
});
