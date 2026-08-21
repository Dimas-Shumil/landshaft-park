'use strict';

(() => {
  const form = document.querySelector('[data-admin-login-form]');

  if (!form) {
    return;
  }

  const errorBox = form.querySelector('[data-login-error]');
  const submitButton = form.querySelector('[data-login-submit]');
  const submitText = form.querySelector('[data-login-submit-text]');
  const passwordInput = form.querySelector('[data-password-input]');
  const passwordToggle = form.querySelector('[data-password-toggle]');

  function showError(message) {
    if (!errorBox) {
      return;
    }

    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    if (!errorBox) {
      return;
    }

    errorBox.textContent = '';
    errorBox.hidden = true;
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) {
      return;
    }

    submitButton.disabled = isSubmitting;
    submitButton.classList.toggle('is-loading', isSubmitting);

    if (submitText) {
      submitText.textContent = isSubmitting ? 'Входим…' : 'Войти';
    }
  }

  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) {
      return;
    }

    const shouldShow = passwordInput.type === 'password';
    passwordInput.type = shouldShow ? 'text' : 'password';
    passwordToggle.setAttribute('aria-pressed', String(shouldShow));
    passwordToggle.setAttribute(
      'aria-label',
      shouldShow ? 'Скрыть пароль' : 'Показать пароль',
    );
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const rememberMe = formData.get('rememberMe') === 'on';

    if (!email || !password) {
      showError('Введите email и пароль.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          email,
          password,
          rememberMe,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        showError(
          payload.message || 'Не удалось войти. Проверьте данные и попробуйте снова.',
        );
        return;
      }

      window.location.replace('/admin');
    } catch {
      showError('Сервер недоступен. Проверьте подключение и попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  });
})();
