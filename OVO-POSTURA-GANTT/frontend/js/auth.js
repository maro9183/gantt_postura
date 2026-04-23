// ── Frontend Auth Manager ──

window.Auth = (() => {
  let currentUser = null;
  
  function init() {
    const token = sessionStorage.getItem('ovo2_token');
    
    // Bind login form
    document.getElementById('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pwd = document.getElementById('login-password').value;
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd })
        });
        
        const data = await res.json();
        
        if (res.ok && data.token) {
          sessionStorage.setItem('ovo2_token', data.token);
          currentUser = data.user;
          document.getElementById('login-overlay').classList.add('hidden');
          // Start the application after login
          window.location.reload(); 
        } else {
          alert('Error: ' + (data.error || 'Credenciales inválidas'));
        }
      } catch (err) {
        console.error(err);
        alert('Error conectando con el servidor');
      }
    });

    return checkSession();
  }
  
  async function checkSession() {
    const token = sessionStorage.getItem('ovo2_token');
    if (!token) {
      showLogin();
      return false;
    }
    
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        document.getElementById('login-overlay').classList.add('hidden');
        return true;
      } else {
        showLogin();
        return false;
      }
    } catch (err) {
      showLogin();
      return false;
    }
  }
  
  function showLogin() {
    sessionStorage.removeItem('ovo2_token');
    currentUser = null;
    document.getElementById('login-overlay').classList.remove('hidden');
  }

  function logout() {
    showLogin();
    window.location.reload();
  }

  function getToken() {
    return sessionStorage.getItem('ovo2_token');
  }

  function getUser() {
    return currentUser;
  }
  
  function hasPerm(action) {
    if (!currentUser) return false;
    if (currentUser.permisos === 'ALL') return true;
    return currentUser.permisos.split(',').map(x => x.trim().toUpperCase()).includes(action.toUpperCase());
  }

  return { init, logout, getToken, getUser, hasPerm, checkSession };
})();
