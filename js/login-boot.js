// Save password before form submits (needed after page reload for decryption)
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', function () {
        sessionStorage.setItem('lore_pw_tmp', this.querySelector('input[name=password]').value);
    });
}

(async () => {
    const el = document.getElementById('login-payload');
    if (!el) return;

    const payload  = JSON.parse(el.dataset.payload);
    const password = sessionStorage.getItem('lore_pw_tmp') || '';
    sessionStorage.removeItem('lore_pw_tmp');

    try {
        document.getElementById('btn-login').textContent = 'Decrypting…';

        const masterKey = await Crypto.unwrapMasterKey(
            password,
            payload.pbkdf2_salt,
            payload.encrypted_master_key
        );

        const raw = await crypto.subtle.exportKey('raw', masterKey);
        sessionStorage.setItem('lore_mk', btoa(String.fromCharCode(...new Uint8Array(raw))));

        window.location.href = '/';
    } catch (e) {
        alert('Failed to decrypt your keys. Wrong password? ' + e.message);
        window.location.href = '/login';
    }
})();
