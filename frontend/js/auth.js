const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authError = document.getElementById('authError');

// Already logged in? Skip straight to the right landing page.
(function redirectIfLoggedIn() {
  const user = getUser();
  if (user) {
    window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
  }
})();

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  authError.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  authError.classList.add('hidden');
});

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove('hidden');
}

function afterLogin(user) {
  window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
    setSession(token, user);
    afterLogin(user);
  } catch (err) {
    showAuthError(err.message);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const { token, user } = await api('/auth/register', { method: 'POST', body: { username, password } });
    setSession(token, user);
    afterLogin(user);
  } catch (err) {
    showAuthError(err.message);
  }
});
