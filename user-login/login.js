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
const profileForm = document.getElementById('profile-form');
const profileName = document.getElementById('profile-name');
const profilePhone = document.getElementById('profile-phone');
const profileMessage = document.getElementById('profile-message');
const saveProfileButton = document.getElementById('save-profile-button');
const signInTab = document.getElementById('signin-tab');
const signUpTab = document.getElementById('signup-tab');
const continueButton = document.getElementById('continue-button');
const backLink = document.querySelector('.back-link');
const allowedReturnPaths = new Set(['/CS.html', '/about.html', '/menu.html', '/store.html', '/contact.html']);

function getWebsiteDestination() {
    const candidates = [
        new URLSearchParams(window.location.search).get('returnTo'),
        document.referrer
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const url = new URL(candidate, window.location.href);
            if (url.origin === window.location.origin && allowedReturnPaths.has(url.pathname)) {
                return `${url.pathname}${url.search}${url.hash}`;
            }
        } catch {
            continue;
        }
    }

    return '../CS.html';
}

const websiteDestination = getWebsiteDestination();
backLink.href = websiteDestination;
continueButton.href = websiteDestination;

let mode = 'signin';
let supabaseClient = null;
let activeUserId = null;

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
    submitButton.textContent = creating ? 'Register' : 'Login';
    signInTab.classList.toggle('active', !creating);
    signUpTab.classList.toggle('active', creating);
    signInTab.setAttribute('aria-selected', String(!creating));
    signUpTab.setAttribute('aria-selected', String(creating));
    showMessage('');
}

async function showUser(user) {
    activeUserId = user?.id || null;
    signedInPanel.classList.toggle('hidden', !user);
    form.classList.toggle('hidden', Boolean(user));
    document.querySelector('.tabs').classList.toggle('hidden', Boolean(user));
    signedInEmail.textContent = user?.email || '';
    if (!user) {
        profileName.value = '';
        profilePhone.value = '';
        profileMessage.textContent = '';
        showMessage('');
        return;
    }

    profileMessage.className = 'message';
    profileMessage.textContent = 'Loading your details…';
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('full_name, phone_number')
        .eq('id', user.id)
        .maybeSingle();

    // Ignore a profile response if the user signed out or changed during the request.
    if (activeUserId !== user.id) return;
    profileName.value = data?.full_name || user.user_metadata?.full_name || '';
    profilePhone.value = data?.phone_number || user.user_metadata?.phone_number || '';
    if (error) {
        profileMessage.className = 'message error';
        profileMessage.textContent = `Could not load saved details: ${error.message}`;
    } else {
        profileMessage.textContent = '';
        showMessage('You are signed in. You can update your details below.', 'success');
    }
}

signInTab.addEventListener('click', () => setMode('signin'));
signUpTab.addEventListener('click', () => setMode('signup'));

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_URL.startsWith('YOUR_') || SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')) {
    showMessage('Add your Supabase project URL and publishable key in login.js to enable accounts.', 'error');
} else if (!window.supabase) {
    showMessage('Supabase client could not load. Check your internet connection.', 'error');
} else {
    supabaseClient = window.csSupabase;
    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) showMessage(error.message, 'error');
        showUser(data?.session?.user || null);
    });
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
        } else if (result.data.session) {
            window.location.assign(websiteDestination);
        } else {
            showMessage('Sign-in completed, but no active session was returned. Please try again.', 'error');
        }
    } catch (error) {
        showMessage(error.message || 'Unable to complete the request. Please try again.', 'error');
    } finally {
        submitButton.disabled = false;
    }
});

profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!supabaseClient || !activeUserId) return;

    saveProfileButton.disabled = true;
    profileMessage.className = 'message';
    profileMessage.textContent = 'Saving your details…';

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({
                full_name: profileName.value.trim(),
                phone_number: profilePhone.value.trim(),
                updated_at: new Date().toISOString()
            })
            .eq('id', activeUserId)
            .select('id')
            .single();

        if (error) throw error;
        if (!data) throw new Error('No profile was updated. Run the profile SQL in Supabase and sign in again.');
        profileMessage.className = 'message success';
        profileMessage.textContent = 'Your details have been updated.';
    } catch (error) {
        profileMessage.className = 'message error';
        profileMessage.textContent = error.message || 'Unable to save your details. Please try again.';
    } finally {
        saveProfileButton.disabled = false;
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
