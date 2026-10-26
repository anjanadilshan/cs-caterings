// Reflect the current Supabase user in the shared site navigation.
(() => {
    const accountLink = document.getElementById('account-nav-link');
    const adminSignInLink = document.getElementById('admin-signin-link');
    const client = window.csSupabase;
    if ((!accountLink && !adminSignInLink) || !client) return;

    const label = accountLink?.querySelector('span');
    let currentUserId = null;

    async function renderAccount(user) {
        currentUserId = user?.id || null;
        if (accountLink) {
            accountLink.classList.toggle('account-signed-in', Boolean(user));
            if (!user) {
                label.textContent = 'Login';
                accountLink.title = 'Login';
                accountLink.setAttribute('aria-label', 'Login');
            }
        }

        if (!user) {
            if (adminSignInLink) {
                adminSignInLink.hidden = true;
            }
            return;
        }

        const fallbackName = user.user_metadata?.full_name?.trim()
            || user.email?.split('@')[0]
            || 'Account';
        const [profileLookup, adminLookup] = await Promise.all([
            client.from('profiles').select('full_name, phone_number').eq('id', user.id).maybeSingle()
                .then(result => ({ data: result.data }))
                .catch(() => ({ data: null })),
            client.rpc('is_admin')
                .then(result => ({ data: result.data, error: result.error }))
                .catch(error => ({ data: false, error }))
        ]);

        if (currentUserId !== user.id) return;
        const profile = profileLookup.data;
        const name = profile?.full_name?.trim() || fallbackName;
        if (accountLink) {
            label.textContent = name;
            accountLink.title = [name, user.email, profile?.phone_number].filter(Boolean).join(' | ');
            accountLink.setAttribute('aria-label', `Account: ${name}${user.email ? `, ${user.email}` : ''}`);
        }

        if (adminSignInLink) {
            const isAdmin = !adminLookup.error && adminLookup.data === true;
            adminSignInLink.hidden = !isAdmin;
            if (isAdmin) {
                adminSignInLink.href = 'user-login/admin/admin.html';
                adminSignInLink.textContent = 'Admin dashboard';
            }
        }
    }

    client.auth.getSession().then(({ data }) => renderAccount(data?.session?.user || null));
    client.auth.onAuthStateChange((_event, session) => renderAccount(session?.user || null));
})();
