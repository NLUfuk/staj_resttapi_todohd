const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authError = document.getElementById('authError');
const verifyNotice = document.getElementById('verifyNotice');
const verifyEmailLabel = document.getElementById('verifyEmailLabel');
const resendBtn = document.getElementById('resendBtn');
const resendMsg = document.getElementById('resendMsg');

// dept_lead manages their department's helpdesk queue from the same panel
// admin uses (scoped by the backend) - only plain 'user' lands on dashboard.html.
function landingPageFor(user) {
  return user.role === 'admin' || user.role === 'dept_lead' ? 'admin.html' : 'dashboard.html';
}

// Already logged in? Skip straight to the right landing page.
(function redirectIfLoggedIn() {
  const user = getUser();
  if (user) {
    window.location.href = landingPageFor(user);
  }
})();

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  verifyNotice.classList.add('hidden');
  authError.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  verifyNotice.classList.add('hidden');
  authError.classList.add('hidden');
});

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove('hidden');
}

function afterLogin(user) {
  window.location.href = landingPageFor(user);
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

let lastRegisteredEmail = null;

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    // Registration no longer returns a session - the account starts
    // unverified and login is blocked until the emailed link is followed.
    await api('/auth/register', { method: 'POST', body: { username, email, password } });
    lastRegisteredEmail = email;
    verifyEmailLabel.textContent = email;
    registerForm.classList.add('hidden');
    resendMsg.classList.add('hidden');
    verifyNotice.classList.remove('hidden');
  } catch (err) {
    showAuthError(err.message);
  }
});

resendBtn.addEventListener('click', async () => {
  if (!lastRegisteredEmail) return;
  try {
    await api('/auth/resend-verification', { method: 'POST', body: { email: lastRegisteredEmail } });
    resendMsg.textContent = 'Onay maili tekrar gönderildi.';
    resendMsg.classList.remove('hidden');
  } catch (err) {
    resendMsg.textContent = err.message;
    resendMsg.classList.remove('hidden');
  }
});
