import { escapeHtml } from './escape.js';

const BRAND = {
    primary: '#8b5cf6',
    primaryDark: '#7c3aed',
    primaryLight: '#a78bfa',
    accent: '#c4b5fd',
    glow: '#ede9fe',
    bg: '#f5f3f9',
    surface: '#fdfcff',
    text: '#2e1065',
    muted: '#7c7b9b',
    border: '#e9e4f4',
    success: '#10b981',
    pink: '#f472b6'
};

function emailShell({ preheader, title, bodyHtml, ctaLabel, ctaUrl, footerNote, heroEmoji }) {
    const safeTitle = escapeHtml(title);
    const safePreheader = escapeHtml(preheader);
    const safeCta = escapeHtml(ctaLabel);
    const safeUrl = escapeHtml(ctaUrl);
    const emoji = heroEmoji || '✨';

    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:'Poppins','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:radial-gradient(circle at 20% 10%,${BRAND.glow} 0%,transparent 45%),radial-gradient(circle at 80% 90%,#ddd6fe 0%,transparent 40%),linear-gradient(165deg,${BRAND.bg} 0%,#ede9fe 55%,${BRAND.bg} 100%);padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;">
          <tr>
            <td style="padding:0 0 24px;text-align:center;">
              <div style="display:inline-block;background:linear-gradient(135deg,${BRAND.primaryLight} 0%,${BRAND.primaryDark} 100%);color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.3px;padding:14px 32px;border-radius:999px;box-shadow:0 10px 30px rgba(124,58,237,0.4),0 0 0 4px rgba(167,139,250,0.25);">
                StudyNexus
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:24px;overflow:hidden;box-shadow:0 24px 48px rgba(109,40,217,0.14),0 4px 12px rgba(46,16,101,0.06);">
              <div style="height:6px;background:linear-gradient(90deg,${BRAND.primaryLight},${BRAND.primary},${BRAND.pink},${BRAND.primaryDark});"></div>
              <div style="padding:40px 36px 36px;">
                <div style="text-align:center;margin-bottom:20px;">
                  <span style="display:inline-block;font-size:48px;line-height:1;filter:drop-shadow(0 4px 8px rgba(124,58,237,0.2));">${emoji}</span>
                </div>
                <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:${BRAND.text};letter-spacing:-0.6px;text-align:center;line-height:1.25;">${safeTitle}</h1>
                <div style="font-size:15px;line-height:1.7;color:${BRAND.muted};">
                  ${bodyHtml}
                </div>
                ${
                    ctaUrl
                        ? `<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin:32px 0 12px;">
                  <tr>
                    <td align="center">
                      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;background:linear-gradient(135deg,${BRAND.primaryLight} 0%,${BRAND.primaryDark} 100%);box-shadow:0 8px 24px rgba(124,58,237,0.45),inset 0 1px 0 rgba(255,255,255,0.25);">
                        ${safeCta} →
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;padding:14px 16px;background:${BRAND.glow};border-radius:12px;font-size:12px;color:${BRAND.muted};word-break:break-all;line-height:1.5;border:1px dashed ${BRAND.accent};">
                  Buton çalışmazsa bu linki tarayıcınıza yapıştırın:<br>
                  <a href="${safeUrl}" style="color:${BRAND.primaryDark};font-weight:600;">${safeUrl}</a>
                </p>`
                        : ''
                }
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 12px 0;text-align:center;font-size:12px;color:${BRAND.muted};line-height:1.6;">
              ${footerNote || 'Bu e-posta StudyNexus hesabınız için otomatik gönderilmiştir.'}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function featurePill(icon, label) {
    return `<span style="display:inline-block;margin:4px 6px 4px 0;padding:8px 14px;background:linear-gradient(135deg,#faf5ff,#f3e8ff);border:1px solid ${BRAND.accent};border-radius:999px;font-size:13px;font-weight:600;color:${BRAND.text};">${icon} ${escapeHtml(label)}</span>`;
}

export function verificationEmail({ name, verifyUrl }) {
    const safeName = escapeHtml(name || 'Merhaba');
    return {
        subject: 'StudyNexus — Hesabınızı doğrulayın 🎓',
        html: emailShell({
            preheader: 'Tek tıkla StudyNexus hesabınızı aktifleştirin — planlarınız sizi bekliyor!',
            title: 'Hoş geldiniz!',
            heroEmoji: '🎓',
            bodyHtml: `
                <p style="margin:0 0 18px;color:${BRAND.text};font-size:17px;text-align:center;">
                  Merhaba <strong style="color:${BRAND.primaryDark};">${safeName}</strong> 👋
                </p>
                <p style="margin:0 0 20px;text-align:center;">
                  StudyNexus ailesine katıldığınız için teşekkürler! Haftalık planlarınızı oluşturmaya başlamadan önce e-posta adresinizi doğrulamanız yeterli.
                </p>
                <div style="text-align:center;margin:24px 0;">
                  ${featurePill('📅', 'Plan oluştur')}
                  ${featurePill('📊', 'İlerleme takibi')}
                  ${featurePill('👩‍🏫', 'Koç bağlantısı')}
                </div>
                <p style="margin:0;padding:16px 18px;background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-radius:14px;border-left:4px solid ${BRAND.primary};font-size:14px;color:${BRAND.text};">
                  <strong style="color:${BRAND.primaryDark};">💡 İpucu:</strong> Doğruladıktan sonra hemen giriş yapıp ilk haftalık planınızı oluşturabilirsiniz.
                </p>
            `,
            ctaLabel: 'Hesabımı Doğrula',
            ctaUrl: verifyUrl,
            footerNote: 'Bu bağlantıyı siz talep etmediyseniz e-postayı yok sayabilirsiniz.'
        })
    };
}

export function resetPasswordEmail({ name, resetUrl }) {
    const safeName = escapeHtml(name || 'Kullanıcı');
    return {
        subject: 'StudyNexus — Şifre sıfırlama 🔐',
        html: emailShell({
            preheader: 'StudyNexus şifrenizi sıfırlamak için bağlantı (1 saat geçerli).',
            title: 'Şifre sıfırlama',
            heroEmoji: '🔐',
            bodyHtml: `
                <p style="margin:0 0 14px;text-align:center;">Merhaba <strong style="color:${BRAND.primaryDark};">${safeName}</strong>,</p>
                <p style="margin:0 0 16px;text-align:center;">
                  Hesabınız için şifre sıfırlama talebi aldık. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.
                </p>
                <p style="margin:0 0 8px;text-align:center;padding:12px 16px;background:#fef3c7;border-radius:12px;font-size:14px;color:#92400e;border:1px solid #fde68a;">
                  ⏱️ Bu bağlantı <strong>1 saat</strong> geçerlidir.
                </p>
                <p style="margin:16px 0 0;text-align:center;font-size:14px;color:${BRAND.muted};">Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
            `,
            ctaLabel: 'Yeni Şifre Belirle',
            ctaUrl: resetUrl,
            footerNote: 'Güvenliğiniz için şifrenizi kimseyle paylaşmayın.'
        })
    };
}
