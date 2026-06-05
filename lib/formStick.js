/** Doğrulama hatası sonrası formlarda alanları korur (şifre hariç). */

export function pickRegisterForm(body = {}) {
    const role = body.role === 'teacher' || body.role === 'student' ? body.role : '';
    return {
        role,
        username: String(body.username ?? '').trim(),
        full_name: String(body.full_name ?? '').trim(),
        email: String(body.email ?? '').trim(),
        location: String(body.location ?? '').trim(),
        birth_date: String(body.birth_date ?? '').trim(),
        grade: String(body.grade ?? '').trim(),
        age: body.age != null && body.age !== '' ? String(body.age) : '',
        branch: String(body.branch ?? '').trim()
    };
}

export function pickForgotForm(body = {}) {
    return { email: String(body.email ?? '').trim() };
}

export function pickLoginForm(body = {}) {
    return { username: String(body.username ?? '').trim() };
}

export function pickResetForm(body = {}) {
    return { token: String(body.token ?? '').trim() };
}
