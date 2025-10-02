document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    
    showRegisterLink.addEventListener('click', (event) => {
        event.preventDefault();
        loginView.classList.add('hidden');
        registerView.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (event) => {
        event.preventDefault();
        registerView.classList.add('hidden');
        loginView.classList.remove('hidden');
    });

    const registerForm = document.getElementById('register-form');
    const registerError = document.getElementById('register-error');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        const username = registerForm.querySelector('input[type="text"]').value;
        const email = registerForm.querySelector('input[type="email"]').value;
        const password = registerForm.querySelector('input[type="password"]').value;

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                showLoginLink.click();
                registerForm.reset();
            } else {
                registerError.textContent = result.message;
            }
        } catch (error) {
            registerError.textContent = 'Не удалось связаться с сервером.';
        }
    });

    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const username = loginForm.querySelector('input[type="text"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (response.ok) {
                localStorage.setItem('username', result.username);
                window.location.href = '/chat.html';
            } else {
                loginError.textContent = result.message;
            }
        } catch (error) {
            loginError.textContent = 'Не удалось связаться с сервером.';
        }
    });
});